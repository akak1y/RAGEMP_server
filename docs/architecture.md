# Архитектура RAGE MP Server

Модульный монолит: один процесс Node.js (встроенный в RAGE MP) со строгими слоями.
С сервером взаимодействуют три рантайма:

- **Игровой клиент** — CEF-мосты `client_packages` + Vue 3 SPA (`UI-Server`, Vite)
- **Веб-админка** — браузер, WebSocket + JWT (`websocket/`)
- **Сервер** — `packages/main`

## Обзор слоёв

```text
client_packages (мосты, клавиши, маркеры)
        ↕  mp.events / callRemote
controllers (тонкие обработчики)   ←   middleware (guards, rate-limit)
        ↓
services (бизнес-логика)           ←   websocket/adminServer (админка)
        ↓
models (Sequelize, ленивая инициализация)
        ↓
MySQL ← core/db   •   Redis ← core/redis
```

## Сервер

### `controllers/` — тонкие обработчики (9 файлов)
| Файл | Ответственность |
|---|---|
| `commandSystem.js` | диспетчер команд: `registerCommand` + `playerCommand` |
| `moneyApi.js` | денежные методы `mp.Player` (БД + память + HUD) |
| `authController.js` | вход/регистрация, выход с сохранением |
| `gameEvents.js` | события игрока: смерть, курьер, статистика |
| `playerCommands.js` | `/pay`, `/kill`, `/endwork` |
| `adminCommands.js` | 10 админ-команд (`/checkban` … `/bench`) |
| `vehicleController.js` | покупка, спавн, заправка |
| `locationController.js` | семья `*:requestPos` — координаты 5 локаций |
| `tuningController.js` | LSC: вход в зону, покупка, выход |

### `middleware/` — проверки прав и error boundary (4)
* `withGuards` — цепочка проверок + единый error boundary
* `isLoggedIn`, `isAdmin` — фабрики guard'ов
* `rateLimit` — Redis-счётчики, fail open, коалесценция нарушений через AuditService

### `services/` — бизнес-логика (12)
Account, Auth, Money, Vehicle, Tuning, Inventory, Location, Stats, Health, Audit, Bot, Courier.
Сервисы не знают про `mp.*`, кроме осознанных game-world сервисов (Vehicle, Tuning, Bot, Courier) — это помечено в их шапках.

### `models/` — Sequelize-модели, ленивые геттеры (5)
Users, Item, Vehicle, AuditLog, Bot. Ленивые геттеры (`getUserModel()`), схема живёт **только в моделях** (references + `ON DELETE CASCADE`), схема создаётся миграциями (`npm run migrate`), модели описывают её для ORM.

### `core/` — инфраструктура: БД, кэш, логи, замеры
`db.js` (пул + initDB), `redis.js` (singleton), `logger.js` (асинхронный, combined/error), `profiler.js` (`perf_hooks`).

## Клиент (`client_packages/`)
* `state.js` — общее состояние в `globalThis.UIState` (в клиенте RAGE MP нет `module.exports`)
* 10 доменных модулей: `auth`, `keys`, `windows`, `interactions`, `speedometer`, `bridges`, `tuning`, `vehicleSync`, `courier`, `bots`
* `index.js` — только создание браузера и порядок `require`

## Веб-админка (`websocket/`)
* HTTP (статика + `/login`) и WS на одном порту; JWT 8 ч, `admin_level >= 1`; битый токен → 4001/4003
* `protocol.js` — типы сообщений: `get_table`, `update_cell`, `player_action`, `vehicle_action`, `delete_row`, `create_row`, `get_metrics`
* Schema-driven формы: сервер шлёт `create_schema` — фронт генерирует формы сам
* Whitelist редактируемых полей + серверная валидация; каждое действие → аудит
* Карта Leaflet с калибровкой `GAME_BOUNDS`; иконки локаций читаются из `config.js` (единый источник правды)
* Живая лента аудита: pub/sub через `AuditService.subscribe`
* `get_metrics` (WS) и HTTP `/metrics` — метрики: собственный Prometheus-exporter без внешних зависимостей
* Вкладка metrics с автообновлением (15 с); аудит — серверная пагинация
* Автореконнект с экспоненциальным бэкоффом; 4001/4003 — без реконнекта

## Ключевые решения
1. **Деньги** — атомарный SQL `UPDATE … WHERE money >= X`; составные операции — внешние транзакции.
2. **Инвентарь** — паттерн «план → транзакция → память»: память мутирует только после commit.
3. **Server-authoritative визуал** — клиент не применяет тюнинг локально.
4. **Rate-limit** — два режима (кулдаун / анти-флуд); серия нарушений сворачивается в одну строку аудита с `repeats`.
5. **Кэш-aside** — экономика в Redis (TTL 60 с); в hot path честный замер реальной операции, синтетический бенчмарк — on-demand (`/bench`).
6. **Позиция игрока** — в памяти каждые 3 с, в MySQL один раз при выходе (защита от Alt+F4).
7. **Graceful shutdown** — SIGINT/SIGTERM корректно закрывают MySQL и Redis.
8. **Координаты в одном месте** — `config.js` → `LocationService` → клиент и админка.
9. **Самописный logger** — winston несовместим с окружением RAGE MP (старый Node, `node:`-импорты).

## Тесты и CI
* Сервер: Jest (MoneyService, InventoryService, AuditService, rateLimit)
* Клиент: глобальный мок `mp.*` + тестовый `__trigger` (`__tests__/setup.js`)
* Корневой `npm test` гоняет оба пакета (`npm --prefix packages/main test && npm --prefix client_packages test`)
* CI: `syntax-check` (сервер + клиент), `server-tests`, `client-tests`
* Интеграционные тесты: реальные MySQL (`ragemp_test`) и Redis (DB 1),  миграции в globalSetup, последовательный прогон (`--runInBand`), полный дроп БД в teardown; env-приоритет над settings.json

## Структура

```text
RAGEMP_server/
├── packages/main/
│   ├── index.js             точка входа
│   ├── config.js            игровые конфиги (координаты, цены)
│   ├── core/                db, redis, logger, profiler
│   ├── controllers/         9 файлов по доменам
│   ├── services/            12 сервисов
│   ├── middleware/          4 файла
│   ├── models/              5 моделей
│   ├── utils/               distance.js
│   ├── websocket/           админка: adminServer, protocol, admin/
│   └── __tests__/           тесты сервера
├── client_packages/
│   ├── index.js, state.js   вход + общее состояние
│   ├── 10 доменных модулей
│   └── __tests__/           тесты клиента + мок mp.*
├── UI-Server/               Vue 3 SPA (Vite)
├── docs/                    architecture.md, графы
└── .github/workflows/       CI
```
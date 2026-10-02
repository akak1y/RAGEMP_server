'use strict';

/**
 * Маппинг внутренних кодов ошибок сервисов в строки для игрока.
 */
const MESSAGES = {
    // общие / auth
    not_authorized: 'Требуется авторизация',
    unauthorized: 'Требуется вход',
    forbidden: 'Доступ запрещён',
    bad_request: 'Некорректный запрос',
    not_found: 'Игрок не найден',
    wrong_password: 'Неверный пароль',
    username_taken: 'Логин уже занят',

    // работа
    work_not_started: 'Работа не начата',
    too_fast: 'Слишком быстро — подожди окончания добычи',
    too_far: 'Подойди ближе',
    rock_depleted: 'Камень уже исчерпан',

    // инвентарь / предметы
    inventory_full: 'Инвентарь полон',
    inventory_error: 'Ошибка инвентаря',
    not_enough_items: 'Недостаточно предметов',
    item_not_in_config: 'Неизвестный предмет',
    invalid_amount: 'Некорректное количество',

    // склад фракции
    storage_full: 'Склад переполнен',
    storage_race: 'Склад изменился одновременно с вами — повторите',

    // магазин
    item_not_in_shop: 'Такого товара нет в магазине',
    insufficient_funds: 'Недостаточно средств',

    // деньги
    not_enough_money: 'Недостаточно средств',
    invalid_sum: 'Некорректная сумма',
    treasury_poor: 'В казне недостаточно средств',
    payout_failed: 'Не удалось выдать деньги, попробуй позже',

    // фракции / права
    no_permission: 'Недостаточно прав',
    not_member: 'Вы не состоите в семье',
    no_faction: 'Вы не состоите в семье',
    already_in_faction: 'Игрок уже состоит в семье',
    rank_too_high: 'Недостаточно ранга для действия с этим игроком',
    rank_limit: 'Достигнут предел ранга',

    // оружие
    no_weapon: 'Сначала достаньте оружие',
    no_weapon_item: 'Нет этого оружия в инвентаре',
    no_weapon_in_hands: 'Оружие не в руках',
    unknown_weapon: 'Неизвестное оружие',
    magazine_full: 'Магазин уже полон',
    no_ammo: 'Нет патронов',
    not_armory_item: 'Этот предмет не относится к арсеналу',
    no_loan: 'Нет активного займа',
    too_many_loans: 'Превышен лимит активных займов',

    // транспорт
    unknown_model: 'Неизвестная модель транспорта',
    owner_not_found: 'Владелец не найден',
    not_owner: 'Это не ваш транспорт',
    no_vehicle: 'Нужно сесть в транспорт',
    invalid_category: 'Неизвестная категория тюнинга',
    invalid_option: 'Недоступная опция',
    already_installed: 'Уже установлено',

    // больница
    invalid_price: 'Некорректная цена',

    // инфраструктура
    db_error: 'Ошибка сохранения, попробуй позже',
};

function humanizeError(code, fallback = 'Что-то пошло не так') {
    if (!code) return fallback;
    return MESSAGES[code] || fallback;
}

module.exports = { humanizeError };

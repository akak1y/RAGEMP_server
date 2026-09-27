'use strict';

/**
 * Маппинг внутренних кодов ошибок сервисов в строки для игрока.
 */
const MESSAGES = {
    not_authorized: 'Требуется авторизация',
    work_not_started: 'Работа не начата',
    too_fast: 'Слишком быстро — подожди окончания добычи',
    too_far: 'Подойди ближе',
    rock_depleted: 'Камень уже исчерпан',
    inventory_full: 'Инвентарь полон',
    storage_full: 'Склад переполнен',
    not_enough_items: 'Недостаточно предметов',
    item_not_in_config: 'Неизвестный предмет',
    invalid_amount: 'Некорректное количество',
    db_error: 'Ошибка сохранения, попробуй позже',
    no_permission: 'Недостаточно прав',
    not_member: 'Вы не состоите в семье',
    no_loan: 'Нет активного займа',
    too_many_loans: 'Превышен лимит активных займов',
    bad_request: 'Некорректный запрос',
    forbidden: 'Доступ запрещён',
    unauthorized: 'Требуется вход',
    unknown_model: 'Неизвестная модель транспорта',
    owner_not_found: 'Владелец не найден',
};

function humanizeError(code, fallback = 'Что-то пошло не так') {
    if (!code) return fallback;
    return MESSAGES[code] || fallback;
}

module.exports = { humanizeError };

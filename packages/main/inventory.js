const Item = require('./models/Item');
const { ItemConfig } = require('./config');

async function loadPlayerInventory(player) {
    player.inventory = new Array(20).fill(null); // пустой инвентарь
    const dbItems = await Item.findAll({ where: { owner_id: player.accountId } }); // вытаскиваем из бд все предметы этого игрока
    
    dbItems.forEach(item => { // раскладываем предметы в инвентарь
        if (item.slot < player.inventory.length) {
            player.inventory[item.slot] = { dbId: item.id, itemId: item.item_id, count: item.count };
        }
    });
    syncInventory(player)
}

function syncInventory(player) { // синхронизируем с фронтэндом
    const clientData = player.inventory.map(slot => slot ? { itemId: slot.itemId, count: slot.count } : null);
    player.call('client:inventory:update', [
        JSON.stringify(clientData),
        JSON.stringify(ItemConfig)
    ])
}

async function giveItem(player, itemId, amount = 1) {
    if (!ItemConfig[itemId]) return false;
    const config = ItemConfig[itemId];
    let existingSlot = player.inventory.findIndex(slot => slot && slot.itemId === itemId && slot.count < config.maxStack); // если уже есть предмет - стакаем его, если не переполнен
    if (existingSlot !== -1) { // если есть предмет
        player.inventory[existingSlot].count += amount;
        
        const itemDb = await Item.findByPk(player.inventory[existingSlot].dbId);
        if (itemDb) {
            itemDb.count = player.inventory[existingSlot].count; // обновляем кол-во в стаке
            await itemDb.save()
        }
        syncInventory(player);
        return true
    }

    let freeSlot = player.inventory.findIndex(slot => slot === null); // ищем пустую ячейку
    if (freeSlot === -1) return false; // если инвентарь полон

    const newItem = await Item.create({ // создаём новый предмет
        owner_id: player.accountId,
        item_id: itemId,
        count: amount,
        slot: freeSlot
    });
    player.inventory[freeSlot] = { dbId: newItem.id, itemId, count: amount };
    syncInventory(player);
    return true;
};

module.exports = { loadPlayerInventory, giveItem, syncInventory }
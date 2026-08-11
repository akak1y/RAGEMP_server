const { DataTypes } = require('sequelize');
const { getSequelize } = require('../db.js');

let Vehicle = null;

function initVehicleModel() {
    if (Vehicle) return Vehicle; // защита от дублирования

    const sequelize = getSequelize();
    if (!sequelize) throw new Error('[Vehicle] Sequelize не инициализирован — сначала initDB');

    Vehicle = sequelize.define('Vehicle', {
        owner_id: { type: DataTypes.INTEGER, allowNull: false },
        model: { type: DataTypes.STRING(50), allowNull: false },
        color_r: { type: DataTypes.INTEGER, defaultValue: 255 },
        color_g: { type: DataTypes.INTEGER, defaultValue: 255 },
        color_b: { type: DataTypes.INTEGER, defaultValue: 255 },
        engine_mod: { type: DataTypes.INTEGER, allowNull: true, defaultValue: -1 },
        wheel_type: { type: DataTypes.INTEGER, allowNull: true, defaultValue: 0 },
        wheel_mod: { type: DataTypes.INTEGER, allowNull: true, defaultValue: -1 },
        brakes_mod: { type: DataTypes.INTEGER, allowNull: true, defaultValue: -1 },
        transmission_mod: { type: DataTypes.INTEGER, allowNull: true, defaultValue: -1 },
        turbo_mod: { type: DataTypes.INTEGER, allowNull: true, defaultValue: -1 },
        fuel: { type: DataTypes.DECIMAL(5, 2), allowNull: false, defaultValue: 100.00 }
    }, { tableName: 'vehicles', timestamps: false });
    return Vehicle
}

module.exports = {
    initVehicleModel,
    getVehicleModel: () => {
        if (!Vehicle) { initVehicleModel() } // если по какой-то причине не создана модель -> создаёт
        return Vehicle
    }
}
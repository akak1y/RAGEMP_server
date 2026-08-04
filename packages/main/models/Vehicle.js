const { DataTypes } = require('sequelize');
const { getSequelize } = require('../db.js');

const Vehicle = getSequelize().define('Vehicle', {
    owner_id: { type: DataTypes.INTEGER, allowNull: false },
    model: { type: DataTypes.STRING(50), allowNull: false },
    color_r: { type: DataTypes.INTEGER, defaultValue: 255 },
    color_g: { type: DataTypes.INTEGER, defaultValue: 255 },
    color_b: { type: DataTypes.INTEGER, defaultValue: 255 },
    engine_mod: {
        type: DataTypes.INTEGER,
        allowNull: true,
        defaultValue: -1
    },
    wheel_type: {
        type: DataTypes.INTEGER,
        allowNull: true,
        defaultValue: 0
    },
    wheel_mod: {
        type: DataTypes.INTEGER,
        allowNull: true,
        defaultValue: -1
    },
    brakes_mod: {
        type: DataTypes.INTEGER,
        allowNull: true,
        defaultValue: -1
    },
    transmission_mod: {
        type: DataTypes.INTEGER,
        allowNull: true,
        defaultValue: -1
    },
    turbo_mod: {
        type: DataTypes.INTEGER,
        allowNull: true,
        defaultValue: -1
    }
}, { tableName: 'vehicles', timestamps: false });

module.exports = Vehicle
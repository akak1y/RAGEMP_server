const { DataTypes } = require('sequelize'); // для описания столбцов
const { getSequelize } = require('../db.js');

let User = null;

function initUserModel() { // функция инициализации модели
    if (User) return User; // защита от дублирования

    const sequelize = getSequelize();
    User = sequelize.define('User', { // создаём модель
        username: {
            type: DataTypes.STRING(32),
            allowNull: false,
            unique: true
        },
        password: {
            type: DataTypes.STRING(255),
            allowNull: false
        },
        money: { type: DataTypes.INTEGER, defaultValue: 50000 },
        admin_level: { type: DataTypes.INTEGER, defaultValue: 0 },
        pos_x: { type: DataTypes.FLOAT, defaultValue: -2183.0 },
        pos_y: { type: DataTypes.FLOAT, defaultValue: 4268.0 },
        pos_z: { type: DataTypes.FLOAT, defaultValue: 48.0 }
    },
    { 
        tableName: 'accounts', 
        timestamps: false 
    });
    return User
};

module.exports = {
    initUserModel,
    getUserModel: () => {
        if (!User) { initUserModel() } // если по какой то причине не создана модель -> создаёт
        return User
    }
}
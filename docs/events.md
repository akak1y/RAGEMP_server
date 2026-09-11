# События сервер → клиент

> Авто-генерация: `npm run docs:events`. Не редактировать вручную.

| Событие                                | Аргументы (по позициям)                   | Отправляется из                                        |
| -------------------------------------- | ----------------------------------------- | ------------------------------------------------------ |
| `client:account:authError`             | string                                    | controllers\authController.js                          |
| `client:account:hideAuth`              | number                                    | controllers\authController.js                          |
| `client:updateMoney`                   | number                                    | controllers\authController.js, controllers\moneyApi.js |
| `client:setRedisStats`                 | number                                    | controllers\gameEvents.js                              |
| `client:ui:debugLog`                   | string, string                            | controllers\adminCommands.js                           |
| `client:faction:setInfo`               | string                                    | controllers\factionController.js                       |
| `client:faction:moneyResult`           | boolean, string                           | controllers\factionController.js                       |
| `client:hospital:result`               | boolean, string                           | controllers\hospitalController.js                      |
| `client:locations:setAll`              | string                                    | controllers\locationController.js                      |
| `client:mining:setData`                | string                                    | controllers\miningController.js                        |
| `client:mining:startChannel`           | number, number                            | controllers\miningController.js                        |
| `client:mining:sellInfo`               | string                                    | controllers\miningController.js                        |
| `client:mining:sellResult`             | boolean, string                           | controllers\miningController.js                        |
| `client:shop:setPos`                   | string                                    | controllers\shopController.js                          |
| `client:shop:show`                     | string                                    | controllers\shopController.js                          |
| `client:shop:buyResult`                | boolean, string                           | controllers\shopController.js                          |
| `client:customCar:setTuningConfig`     | string                                    | controllers\tuningController.js                        |
| `client:customCar:setTuningState`      | string                                    | controllers\tuningController.js                        |
| `client:custom:startTuning`            | number, number, number, number            | controllers\tuningController.js                        |
| `client:dealership:setConfig`          | string                                    | controllers\vehicleController.js                       |
| `client:phone:setCarList`              | string, string                            | controllers\vehicleController.js                       |
| `client:phone:requestPriceDeliveryCar` | number                                    | controllers\vehicleController.js                       |
| `client:phone:updateCars`              |                                           | controllers\vehicleController.js                       |
| `client:inventory:update`              | string, string                            | services\InventoryService.js                           |
| `client:bot:setup`                     | number, number                            | services\BotService.js                                 |
| `client:courier:target`                | number, number, number, string _или_ null | services\CourierService.js                             |
| `client:faction:open`                  |                                           | controllers\factionController.js                       |
| `client:faction:memberResult`          | boolean, string                           | controllers\factionController.js                       |
| `client:mining:rocksUpdate`            | string                                    | services\MiningService.js                              |

// Compatibility export. Dispatch data belongs to `dispatch_orders`; shared
// customer orders use `orders` and must never be registered through this file.
module.exports = require('./DispatchOrder');

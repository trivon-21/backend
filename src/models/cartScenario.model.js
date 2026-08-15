const mongoose = require('mongoose');

const CartScenarioSchema = new mongoose.Schema({
  scenarioName: { type: String, required: true },
  items: [
    {
      name: { type: String, required: true },
      price: { type: Number, required: true },
      quantity: { type: Number, default: 1 },
      purchaseType: {
        type: String,
        enum: ['buy_only', 'buy_and_install'],
        required: true
      }
    }
  ],
  totalAmount: { type: Number, required: true }
});

module.exports = mongoose.model('CartScenario', CartScenarioSchema);

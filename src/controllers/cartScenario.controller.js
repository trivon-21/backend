const CartScenario = require('../models/cartScenario.model');
const Order = require('../models/order.model');
const Counter = require('../models/counter.model');

exports.getScenarios = async (req, res) => {
  try {
    const scenarios = await CartScenario.find();
    res.json({ success: true, data: scenarios });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.seedScenarios = async (req, res) => {
  try {
    const seedData = [
      {
        scenarioName: "Single Item Buy Only",
        items: [
          { name: "AirLux Premium Split AC - 1.5 Ton", price: 249000, quantity: 1, purchaseType: "buy_only" }
        ],
        totalAmount: 249000
      },
      {
        scenarioName: "Mixed Cart - 3 Items",
        items: [
          { name: "Elegance Pro 5000", price: 185000, quantity: 1, purchaseType: "buy_only" },
          { name: "Daikin 24688", price: 210000, quantity: 2, purchaseType: "buy_and_install" }
        ],
        totalAmount: 605000
      }
    ];

    await CartScenario.deleteMany({});
    await CartScenario.insertMany(seedData);
    res.json({ success: true, message: 'Scenarios seeded successfully' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.checkoutScenario = async (req, res) => {
  try {
    const { scenarioId, userId, delivery } = req.body;

    const scenario = await CartScenario.findById(scenarioId);
    if (!scenario) return res.status(404).json({ success: false, message: 'Scenario not found' });

    // Determine prefix and counter based on first item
    const mainType = scenario.items[0]?.purchaseType || 'buy_only';
    const prefix = mainType === 'buy_and_install' ? 'ALX-BI' : 'ALX-BO';
    const counterId = mainType === 'buy_and_install' ? 'orderReference_BI' : 'orderReference_BO';

    // Generate Sequential Order Reference
    const counter = await Counter.findOneAndUpdate(
      { _id: counterId },
      { $inc: { seq: 1 } },
      { new: true, upsert: true }
    );
    const sequenceNum = counter.seq.toString().padStart(4, '0');
    const orderReference = `${prefix}-${sequenceNum}`;

    const order = new Order({
      orderReference,
      orderId: orderReference,
      userId: userId || 'demo-user',
      items: scenario.items.map(item => ({
        productId: 'mock-id',
        name: item.name,
        price: item.price,
        quantity: item.quantity,
        purchaseType: item.purchaseType
      })),
      delivery: delivery || { 
        firstName: 'Mock', lastName: 'User', address: '123 Mock St', 
        district: 'Colombo', zipCode: '00100', phone: '0112233445', email: 'mock@example.com' 
      },
      subtotal: scenario.totalAmount,
      additionalCharges: 0,
      total: scenario.totalAmount,
      status: 'Pending Payment'
    });

    await order.save();
    res.status(201).json({ success: true, data: order });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const Cart = require('../models/cart.model');
const Product = require('../models/product.model');

// Helper to calculate cart totals
async function calculateCart(cart) {
  let subtotal = 0;
  let units = 0;
  for (const item of cart.items) {
    const product = await Product.findById(item.product);
    if (product) {
      subtotal += product.price * item.quantity;
      units += item.quantity;
    }
  }
  // Example: Additional charges could be a flat fee or percentage
  const additionalCharges = cart.additionalCharges || 0;
  const deliveryCharge = 0; // Default to free for now
  const discount = 0; // Default to no discount for now
  const total = subtotal + additionalCharges + deliveryCharge - discount;
  return { units, subtotal, additionalCharges, deliveryCharge, discount, total };
}

// Get cart for a user
exports.getCart = async (req, res) => {
  try {
    const userId = req.params.userId;
    let cart = await Cart.findOne({ userId }).populate('items.product');
    if (!cart) {
      cart = new Cart({ userId, items: [] });
      await cart.save();
    }

    // Auto-remove items whose product has gone out of stock
    const removedItems = [];
    const validItems = [];
    for (const item of cart.items) {
      const prod = item.product;
      // prod is populated; check inStock (treat missing/null product as out-of-stock)
      if (prod && typeof prod === 'object' && prod.inStock === false) {
        removedItems.push(prod.name || 'Unknown Product');
      } else {
        validItems.push(item);
      }
    }

    if (removedItems.length > 0) {
      cart.items = validItems;
      cart.markModified('items');
      await cart.save();
    }

    const calculations = await calculateCart(cart);
    res.json({ cart, ...calculations, removedItems });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Add or update item in cart
exports.addOrUpdateItem = async (req, res) => {
  try {
    const { userId, productId, quantity, purchaseType } = req.body;
    console.log('[Cart] addOrUpdateItem →', { userId, productId, quantity, purchaseType });

    let cart = await Cart.findOne({ userId });
    if (!cart) {
      cart = new Cart({ userId, items: [] });
    }
    const itemIndex = cart.items.findIndex(i => i.product.toString() === productId);
    if (itemIndex > -1) {
      cart.items[itemIndex].quantity = quantity;
      if (purchaseType) cart.items[itemIndex].purchaseType = purchaseType;
    } else {
      cart.items.push({ product: productId, quantity, purchaseType: purchaseType || 'buy_only' });
    }
    cart.markModified('items');   // ensure Mongoose detects nested subdocument changes
    await cart.save();
    const calculations = await calculateCart(cart);
    res.json({ cart, ...calculations });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};


// Remove item from cart
exports.removeItem = async (req, res) => {
  try {
    const { userId, productId } = req.body;
    let cart = await Cart.findOne({ userId });
    if (!cart) return res.status(404).json({ error: 'Cart not found' });
    cart.items = cart.items.filter(i => i.product.toString() !== productId);
    await cart.save();
    const calculations = await calculateCart(cart);
    res.json({ cart, ...calculations });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Clear cart
exports.clearCart = async (req, res) => {
  try {
    const { userId } = req.body;
    let cart = await Cart.findOne({ userId });
    if (!cart) return res.status(404).json({ error: 'Cart not found' });
    cart.items = [];
    await cart.save();
    res.json({ cart, units: 0, subtotal: 0, additionalCharges: 0, total: 0 });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Update additional charges
exports.updateAdditionalCharges = async (req, res) => {
  try {
    const { userId, additionalCharges } = req.body;
    let cart = await Cart.findOne({ userId });
    if (!cart) return res.status(404).json({ error: 'Cart not found' });
    cart.additionalCharges = additionalCharges;
    await cart.save();
    const calculations = await calculateCart(cart);
    res.json({ cart, ...calculations });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

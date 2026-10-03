const mongoose = require('mongoose');
const Cart = require('../models/cart.model');
const Product = require('../models/product.model');
const Inventory = require('../models/Inventory');

// Helper to calculate cart totals
async function calculateCart(cart) {
  let subtotal = 0;
  let units = 0;
  for (const item of cart.items) {
    let product = await Inventory.findById(item.product);
    if (!product) {
      product = await Product.findById(item.product);
    }
    if (product) {
      const price = (product.pricing && product.pricing.sellingPricePerUnit !== undefined)
        ? product.pricing.sellingPricePerUnit
        : (product.price !== undefined ? product.price : (product.pricing?.costPerUnit || product.unitCost || 0));
      subtotal += price * item.quantity;
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
    let cart = await Cart.findOne({ userId });
    if (!cart) {
      cart = new Cart({ userId, items: [] });
      await cart.save();
    }

    const populatedItems = [];
    const removedItems = [];

    // Populate each item's product details from Inventory (primary) or Product (fallback)
    for (const item of cart.items) {
      const prodId = (item.product?._id || item.product || '').toString();
      let prodDoc = null;
      if (mongoose.Types.ObjectId.isValid(prodId)) {
        prodDoc = await Inventory.findById(prodId);
        if (!prodDoc) {
          prodDoc = await Product.findById(prodId);
        }
      }

      if (prodDoc) {
        const inStock = prodDoc.available !== undefined ? (prodDoc.available > 0) : (prodDoc.inStock !== false);
        if (!inStock) {
          removedItems.push(prodDoc.name || 'Out of stock product');
        } else {
          populatedItems.push({
            _id: item._id,
            product: {
              _id: prodDoc._id,
              name: prodDoc.name,
              brand: prodDoc.brand,
              category: prodDoc.subcategory || prodDoc.category,
              price: (prodDoc.pricing && prodDoc.pricing.sellingPricePerUnit !== undefined)
                ? prodDoc.pricing.sellingPricePerUnit
                : (prodDoc.price !== undefined ? prodDoc.price : (prodDoc.pricing?.costPerUnit || prodDoc.unitCost || 0)),
              image: prodDoc.image || 'assets/placeholder.png',
              capacity: prodDoc.capacityBtu || prodDoc.capacity || 12000,
              inStock: true
            },
            quantity: item.quantity,
            purchaseType: item.purchaseType || 'buy_only'
          });
        }
      } else {
        removedItems.push('Unknown Product');
      }
    }

    // Auto-remove invalid or out of stock items from the DB cart
    if (removedItems.length > 0) {
      const validIds = new Set(populatedItems.map(p => p.product._id.toString()));
      cart.items = cart.items.filter(i => {
        const pid = (i.product?._id || i.product || '').toString();
        return validIds.has(pid);
      });
      cart.markModified('items');
      await cart.save();
    }

    const calculations = await calculateCart(cart);
    res.json({
      cart: {
        _id: cart._id,
        userId: cart.userId,
        items: populatedItems,
        additionalCharges: cart.additionalCharges || 0
      },
      ...calculations,
      removedItems
    });
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
    cart.items = cart.items.filter(i => {
      const pid = (i.product?._id || i.product || '').toString();
      const itemId = (i._id || '').toString();
      if (!productId || productId === 'null' || productId === 'undefined') {
        return false;
      }
      return pid !== productId && itemId !== productId;
    });
    cart.markModified('items');
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

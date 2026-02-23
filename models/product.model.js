const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
    name: {
        type: String,
        required: [true, 'Product name is required'],
        trim: true
    },
    description: {
        type: String,
        trim: true
    },
    brand: {
        type: String,
        required: [true, 'Brand is required'],
        trim: true
    },
    category: {
        type: String,
        required: [true, 'Category is required'],
        trim: true
    },
    image: {
        type: String,
        trim: true
    },
    capacity: {
        type: Number,
        required: [true, 'Capacity is required']
    },
    price: {
        type: Number,
        required: [true, 'Price is required'],
        min: 0
    },
    inStock: {
        type: Boolean,
        default: true
    }
});

const Product = mongoose.model('Product', productSchema);

module.exports = Product;

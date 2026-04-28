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
    // Primary image (used by catalog cards)
    image: {
        type: String,
        trim: true
    },
    // Gallery images for product-detail page (optional)
    images: {
        type: [String],
        default: []
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
    // Capacity variants with individual prices shown in product-detail dropdown
    // e.g. [{ capacity: 1.5, price: 125000, label: "1.5 Ton" }]
    variants: {
        type: [
            {
                capacity: { type: Number, required: true },
                price: { type: Number, required: true, min: 0 },
                label: { type: String, trim: true }
            }
        ],
        default: []
    },
    // Technical specifications for the Specifications tab
    // e.g. [{ key: "Cooling Capacity", value: "1.5 Ton (18,000 BTU)" }]
    specs: {
        type: [
            {
                key: { type: String, trim: true },
                value: { type: String, trim: true }
            }
        ],
        default: []
    },
    // Warranty details for the Warranty tab
    warrantyInfo: {
        comprehensive: { type: String, trim: true },
        compressor: { type: String, trim: true },
        covered: { type: [String], default: [] },
        notCovered: { type: [String], default: [] }
    },
    // Feature bullet points shown on product-detail page
    features: {
        type: [String],
        default: []
    },
    inStock: {
        type: Boolean,
        default: true
    }
});

const Product = mongoose.model('Product', productSchema);

module.exports = Product;

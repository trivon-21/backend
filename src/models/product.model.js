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
    },
    // User reviews
    reviews: {
        type: [
            {
                userName: { type: String, required: true, trim: true },
                rating: { type: Number, required: true, min: 1, max: 5 },
                comment: { type: String, required: true, trim: true },
                date: { type: Date, default: Date.now }
            }
        ],
        default: []
    },
    // Calculated rating data
    averageRating: {
        type: Number,
        default: 0
    },
    reviewCount: {
        type: Number,
        default: 0
    }
}, { timestamps: true });

// Add indexes for faster filtering and sorting
productSchema.index({ brand: 1 });
productSchema.index({ category: 1 });
productSchema.index({ capacity: 1 });
productSchema.index({ price: 1 });
productSchema.index({ createdAt: -1 });

// Middleware to update averageRating and reviewCount before saving
productSchema.pre('save', function(next) {
    if (this.reviews && this.reviews.length > 0) {
        this.reviewCount = this.reviews.length;
        const total = this.reviews.reduce((sum, r) => sum + r.rating, 0);
        this.averageRating = parseFloat((total / this.reviewCount).toFixed(1));
    } else {
        this.reviewCount = 0;
        this.averageRating = 0;
    }
    next();
});

const Product = mongoose.model('Product', productSchema);

module.exports = Product;

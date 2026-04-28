const Product = require('../models/product.model');

// GET /api/products — Fetch all products with filtering and pagination
const getAllProducts = async (req, res) => {
    try {
        const {
            category,
            brand,
            capacity,
            minPrice,
            maxPrice,
            page = 1,
            limit = 9
        } = req.query;

        // Validate page and limit
        const pageNum = parseInt(page);
        const limitNum = parseInt(limit);
        if (isNaN(pageNum) || pageNum < 1 || isNaN(limitNum) || limitNum < 1) {
            return res.status(400).json({ success: false, message: 'Invalid page or limit parameter' });
        }

        // Build query filter
        const filter = {};

        if (category) {
            filter.category = category;
        }

        if (brand) {
            const brands = brand.split(',').map(b => b.trim()).filter(Boolean);
            if (brands.length > 0) filter.brand = { $in: brands };
        }

        if (capacity) {
            const capacities = capacity.split(',').map(c => parseInt(c.trim())).filter(c => !isNaN(c));
            if (capacities.length > 0) filter.capacity = { $in: capacities };
        }

        if (minPrice !== undefined || maxPrice !== undefined) {
            filter.price = {};
            if (minPrice !== undefined) {
                const min = parseFloat(minPrice);
                if (isNaN(min)) return res.status(400).json({ success: false, message: 'Invalid minPrice parameter' });
                filter.price.$gte = min;
            }
            if (maxPrice !== undefined) {
                const max = parseFloat(maxPrice);
                if (isNaN(max)) return res.status(400).json({ success: false, message: 'Invalid maxPrice parameter' });
                filter.price.$lte = max;
            }
        }

        const total = await Product.countDocuments(filter);
        const totalPages = Math.ceil(total / limitNum);
        const skip = (pageNum - 1) * limitNum;

        const products = await Product.find(filter)
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limitNum);

        res.status(200).json({
            success: true,
            total,
            page: pageNum,
            totalPages,
            data: products
        });
    } catch (error) {
        console.error('getAllProducts error:', error);
        res.status(500).json({ success: false, message: 'Server error while fetching products' });
    }
};

// GET /api/products/filters/options — Fetch dynamic filter options
const getFilterOptions = async (req, res) => {
    try {
        const [brands, categories, capacities, priceStats] = await Promise.all([
            Product.distinct('brand'),
            Product.distinct('category'),
            Product.distinct('capacity'),
            Product.aggregate([
                {
                    $group: {
                        _id: null,
                        min: { $min: '$price' },
                        max: { $max: '$price' }
                    }
                }
            ])
        ]);

        const priceRange = priceStats.length > 0
            ? { min: priceStats[0].min, max: priceStats[0].max }
            : { min: 0, max: 500000 };

        res.status(200).json({
            success: true,
            brands: brands.sort(),
            categories: categories.sort(),
            capacities: capacities.sort(),
            priceRange
        });
    } catch (error) {
        console.error('getFilterOptions error:', error);
        res.status(500).json({ success: false, message: 'Server error while fetching filter options' });
    }
};

// GET /api/products/:id — Fetch single product by ID
const getProductById = async (req, res) => {
    try {
        const { id } = req.params;

        // Validate ObjectId format
        if (!id.match(/^[0-9a-fA-F]{24}$/)) {
            return res.status(400).json({ success: false, message: 'Invalid product ID format' });
        }

        const product = await Product.findById(id);

        if (!product) {
            return res.status(404).json({ success: false, message: 'Product not found' });
        }

        res.status(200).json({ success: true, data: product });
    } catch (error) {
        console.error('getProductById error:', error);
        res.status(500).json({ success: false, message: 'Server error while fetching product' });
    }
};

// POST /api/products/:id/reviews — Add a new review
const addProductReview = async (req, res) => {
    try {
        const { id } = req.params;
        const { userName, rating, comment } = req.body;

        if (!id.match(/^[0-9a-fA-F]{24}$/)) {
            return res.status(400).json({ success: false, message: 'Invalid product ID format' });
        }

        const product = await Product.findById(id);
        if (!product) {
            return res.status(404).json({ success: false, message: 'Product not found' });
        }

        const newReview = {
            userName,
            rating: Number(rating),
            comment,
            date: new Date()
        };

        product.reviews.push(newReview);
        
        // The pre('save') hook will update averageRating and reviewCount
        await product.save();

        res.status(201).json({ 
            success: true, 
            message: 'Review added successfully',
            data: {
                averageRating: product.averageRating,
                reviewCount: product.reviewCount,
                reviews: product.reviews
            }
        });
    } catch (error) {
        console.error('addProductReview error:', error);
        res.status(500).json({ success: false, message: 'Server error while adding review' });
    }
};

module.exports = {
    getAllProducts,
    getFilterOptions,
    getProductById,
    createProduct,
    addProductReview
};

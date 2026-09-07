const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const Product = require('../models/product.model');
const Order = require('../models/Order');
const InstallationOrder = require('../models/installationOrder.model');
const User = require('../models/User');

// Helper: check if a user is a verified buyer of a specific product (Strict Production Mode)
async function isVerifiedBuyerForProduct(userId, productId) {
    if (!userId || !productId) return false;
    const strUserId = String(userId).trim();
    const strProdId = String(productId).trim();

    const objectIdUser = mongoose.Types.ObjectId.isValid(strUserId)
        ? new mongoose.Types.ObjectId(strUserId)
        : null;

    const objectIdProd = mongoose.Types.ObjectId.isValid(strProdId)
        ? new mongoose.Types.ObjectId(strProdId)
        : null;

    const productMatchClause = [
        { "items.productId": strProdId },
        { "items.product": strProdId },
        { $expr: { $in: [strProdId, { $map: { input: "$items", as: "i", in: { $toString: { $ifNull: ["$$i.productId", "$$i.product"] } } } }] } }
    ];

    // 1. Check Buy Only orders (confirmed / approved by Finance)
    const buyOnlyOrder = await Order.findOne({
        $and: [
            Order.ownerCompatibilityFilter(strUserId),
            { $or: productMatchClause },
            {
                $or: [
                    { paymentStatus: { $in: ['Approved', 'Confirmed'] } },
                    { status: { $in: ['Payment Confirmed', 'Confirmed', 'Shipped', 'Delivered', 'Completed'] } }
                ]
            }
        ]
    }).lean();

    if (buyOnlyOrder) return true;

    // 2. Check Buy & Install orders (confirmed)
    const buyInstallOrder = await InstallationOrder.findOne({
        $and: [
            {
                $or: [
                    { userId: strUserId },
                    { $expr: { $eq: [{ $toString: "$userId" }, strUserId] } }
                ]
            },
            { $or: productMatchClause },
            {
                $or: [
                    { status: { $in: ['Confirmed', 'Installation Scheduled', 'Installation Completed', 'Completed'] } },
                    { paymentStatus: { $in: ['Approved', 'Confirmed', 'Paid'] } }
                ]
            }
        ]
    }).lean();

    return !!buyInstallOrder;
}

// GET /api/products — Fetch all products with filtering and pagination
const getAllProducts = async (req, res) => {
    try {
        const {
            category,
            brand,
            capacity,
            minPrice,
            maxPrice,
            search,
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

        if (search && search.trim()) {
            const searchRegex = new RegExp(search.trim(), 'i');
            filter.$or = [
                { name: searchRegex },
                { brand: searchRegex },
                { category: searchRegex },
                { description: searchRegex }
            ];
        }

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

// GET /api/products/:id/review-eligibility — Check if user is eligible to review
const checkReviewEligibility = async (req, res) => {
    try {
        const { id } = req.params;
        if (!id || !id.match(/^[0-9a-fA-F]{24}$/)) {
            return res.status(400).json({ success: false, message: 'Invalid product ID' });
        }

        let user = null;
        const authHeader = req.headers.authorization;
        if (authHeader && authHeader.startsWith('Bearer ')) {
            try {
                const token = authHeader.split(' ')[1];
                const decoded = jwt.verify(token, process.env.JWT_SECRET);
                user = await User.findById(decoded.id).select('-passwordHash');
            } catch (err) {
                // Token invalid or expired
            }
        }

        if (!user) {
            return res.json({
                success: true,
                isEligible: false,
                isVerifiedBuyer: false,
                reason: 'NOT_LOGGED_IN'
            });
        }

        const isBuyer = await isVerifiedBuyerForProduct(user._id, id);
        const displayName = [user.fullName, user.lastName].filter(Boolean).join(' ').trim() || user.fullName;

        return res.json({
            success: true,
            isEligible: isBuyer,
            isVerifiedBuyer: isBuyer,
            userName: displayName,
            reason: isBuyer ? 'ELIGIBLE' : 'NOT_A_BUYER'
        });
    } catch (error) {
        console.error('checkReviewEligibility error:', error);
        res.status(500).json({ success: false, message: 'Server error checking review eligibility' });
    }
};

// POST /api/products/:id/reviews — Add a new review (Protected + Verified Buyer Only)
const addProductReview = async (req, res) => {
    try {
        const { id } = req.params;
        const { rating, comment, userName } = req.body;

        if (!id.match(/^[0-9a-fA-F]{24}$/)) {
            return res.status(400).json({ success: false, message: 'Invalid product ID format' });
        }

        const product = await Product.findById(id);
        if (!product) {
            return res.status(404).json({ success: false, message: 'Product not found' });
        }

        // Strict Mode Check: Must be a verified buyer of this product
        const isBuyer = await isVerifiedBuyerForProduct(req.user._id, id);
        if (!isBuyer) {
            return res.status(403).json({
                success: false,
                message: 'Only verified buyers who have a confirmed order for this product can leave a review.'
            });
        }

        const userDisplayName = [req.user.fullName, req.user.lastName].filter(Boolean).join(' ').trim() || req.user.fullName || userName || 'Verified Customer';

        // Prevent duplicate reviews from the same customer
        const alreadyReviewed = product.reviews.some(r =>
            (r.userId && r.userId.toString() === req.user._id.toString()) ||
            (!r.userId && r.userName === userDisplayName)
        );

        if (alreadyReviewed) {
            return res.status(400).json({
                success: false,
                message: 'You have already submitted a review for this product. You can edit your existing review.'
            });
        }

        const newReview = {
            userId: req.user._id,
            userName: userDisplayName,
            rating: Number(rating),
            comment: comment ? String(comment).trim() : '',
            isVerifiedBuyer: true,
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

// PUT /api/products/:id/reviews/:reviewId — Update review (Author only)
const updateProductReview = async (req, res) => {
    try {
        const { id, reviewId } = req.params;
        const { rating, comment } = req.body;

        if (!id.match(/^[0-9a-fA-F]{24}$/) || !reviewId.match(/^[0-9a-fA-F]{24}$/)) {
            return res.status(400).json({ success: false, message: 'Invalid product or review ID format' });
        }

        const product = await Product.findById(id);
        if (!product) {
            return res.status(404).json({ success: false, message: 'Product not found' });
        }

        const review = product.reviews.id(reviewId);
        if (!review) {
            return res.status(404).json({ success: false, message: 'Review not found' });
        }

        // Author ownership check
        const userDisplayName = [req.user.fullName, req.user.lastName].filter(Boolean).join(' ').trim() || req.user.fullName;
        const isAuthor = (review.userId && review.userId.toString() === req.user._id.toString()) ||
                         (!review.userId && review.userName === userDisplayName);

        if (!isAuthor && req.user.role !== 'admin' && req.user.role !== 'super-admin') {
            return res.status(403).json({ success: false, message: 'You are not authorized to edit this review' });
        }

        if (rating !== undefined) {
            const numRating = Number(rating);
            if (numRating >= 1 && numRating <= 5) {
                review.rating = numRating;
            }
        }

        if (comment !== undefined) {
            if (!String(comment).trim()) {
                return res.status(400).json({ success: false, message: 'Review comment cannot be empty' });
            }
            review.comment = String(comment).trim();
        }

        // Save will re-trigger pre('save') to recalculate averageRating
        await product.save();

        res.status(200).json({
            success: true,
            message: 'Review updated successfully',
            data: {
                averageRating: product.averageRating,
                reviewCount: product.reviewCount,
                reviews: product.reviews
            }
        });
    } catch (error) {
        console.error('updateProductReview error:', error);
        res.status(500).json({ success: false, message: 'Server error while updating review' });
    }
};

// DELETE /api/products/:id/reviews/:reviewId — Delete review (Author only)
const deleteProductReview = async (req, res) => {
    try {
        const { id, reviewId } = req.params;

        if (!id.match(/^[0-9a-fA-F]{24}$/) || !reviewId.match(/^[0-9a-fA-F]{24}$/)) {
            return res.status(400).json({ success: false, message: 'Invalid product or review ID format' });
        }

        const product = await Product.findById(id);
        if (!product) {
            return res.status(404).json({ success: false, message: 'Product not found' });
        }

        const review = product.reviews.id(reviewId);
        if (!review) {
            return res.status(404).json({ success: false, message: 'Review not found' });
        }

        // Author ownership check
        const userDisplayName = [req.user.fullName, req.user.lastName].filter(Boolean).join(' ').trim() || req.user.fullName;
        const isAuthor = (review.userId && review.userId.toString() === req.user._id.toString()) ||
                         (!review.userId && review.userName === userDisplayName);

        if (!isAuthor && req.user.role !== 'admin' && req.user.role !== 'super-admin') {
            return res.status(403).json({ success: false, message: 'You are not authorized to delete this review' });
        }

        product.reviews.pull(reviewId);
        await product.save();

        res.status(200).json({
            success: true,
            message: 'Review deleted successfully',
            data: {
                averageRating: product.averageRating,
                reviewCount: product.reviewCount,
                reviews: product.reviews
            }
        });
    } catch (error) {
        console.error('deleteProductReview error:', error);
        res.status(500).json({ success: false, message: 'Server error while deleting review' });
    }
};

module.exports = {
    getAllProducts,
    getFilterOptions,
    getProductById,
    checkReviewEligibility,
    addProductReview,
    updateProductReview,
    deleteProductReview
};

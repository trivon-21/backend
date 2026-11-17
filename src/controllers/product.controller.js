const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const Product = require('../models/product.model');
const Inventory = require('../models/Inventory');
const Order = require('../models/Order');
const InstallationOrder = require('../models/installationOrder.model');
const User = require('../models/User');
const SystemConfig = require('../models/SystemConfig');

// Helper to map an Inventory document to the shape expected by catalog and product details
function mapInventoryToProduct(item) {
    if (!item) return null;
    const doc = item.toObject ? item.toObject() : item;
    return {
        _id: doc._id,
        name: doc.name,
        brand: doc.brand,
        category: doc.subcategory || doc.category || 'Split AC',
        description: doc.description || '',
        image: doc.image || 'placeholder.png',
        images: doc.images || [],
        capacity: doc.capacityBtu || doc.capacity || 12000,
        price: (doc.pricing && doc.pricing.sellingPricePerUnit !== undefined)
            ? doc.pricing.sellingPricePerUnit
            : (doc.price !== undefined ? doc.price : (doc.pricing?.costPerUnit || doc.unitCost || 0)),
        specs: doc.specs || [],
        warrantyInfo: doc.warrantyInfo || {},
        features: doc.features || [],
        reviews: doc.reviews || [],
        averageRating: doc.averageRating || 0,
        reviewCount: doc.reviewCount || (doc.reviews ? doc.reviews.length : 0),
        inStock: doc.available !== undefined ? (doc.available > 0) : (doc.inStock !== false),
        available: doc.available,
        sku: doc.sku,
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt
    };
}

// Helper: check if a user is a verified buyer of a specific product (Strict Production Mode)
async function isVerifiedBuyerForProduct(userId, productId) {
    if (!userId || !productId) return false;
    const strUserId = String(userId).trim();
    const strProdId = String(productId).trim();

    // 1. Resolve product to identify name, brand, SKU, and all associated IDs (Inventory and legacy Product)
    let product = null;
    if (mongoose.isValidObjectId(strProdId)) {
        product = await Inventory.findById(strProdId).lean();
        if (!product) {
            product = await Product.findById(strProdId).lean();
        }
    }

    const candidateIds = new Set([strProdId]);
    if (product) {
        candidateIds.add(String(product._id));
        if (product.legacyProductId) {
            candidateIds.add(String(product.legacyProductId));
        }

        // Cross-match legacy Product document by name or SKU
        const legacyProd = await Product.findOne({
            $or: [
                { name: product.name },
                ...(product.sku ? [{ sku: product.sku }] : [])
            ]
        }).lean();
        if (legacyProd) {
            candidateIds.add(String(legacyProd._id));
        }

        // Cross-match Inventory document by name or SKU
        const invItem = await Inventory.findOne({
            $or: [
                { name: product.name },
                ...(product.sku ? [{ sku: product.sku }] : [])
            ]
        }).lean();
        if (invItem) {
            candidateIds.add(String(invItem._id));
        }
    }

    const idList = Array.from(candidateIds);
    const productMatchClause = [
        { "items.productId": { $in: idList } },
        { "items.product": { $in: idList } },
        { $expr: { $gt: [{ $size: { $setIntersection: [idList, { $map: { input: "$items", as: "i", in: { $toString: { $ifNull: ["$$i.productId", "$$i.product"] } } } }] } }, 0] } }
    ];

    if (product && product.name) {
        productMatchClause.push({ "items.name": product.name });
    }

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

// GET /api/products — Fetch all AC equipment products from inventory with filtering and pagination
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

        // Base filter: Query AC Equipment from Inventory
        const filterClauses = [
            {
                $or: [
                    { category: 'AC Equipment' },
                    { itemClass: 'AC Equipment' }
                ]
            }
        ];

        if (search && search.trim()) {
            const searchRegex = new RegExp(search.trim(), 'i');
            filterClauses.push({
                $or: [
                    { name: searchRegex },
                    { brand: searchRegex },
                    { category: searchRegex },
                    { subcategory: searchRegex },
                    { description: searchRegex },
                    { sku: searchRegex }
                ]
            });
        }

        if (category) {
            const catRegex = new RegExp(category.trim(), 'i');
            filterClauses.push({
                $or: [
                    { subcategory: catRegex },
                    { category: catRegex },
                    { systemType: catRegex }
                ]
            });
        }

        if (brand) {
            const brands = brand.split(',').map(b => b.trim()).filter(Boolean);
            if (brands.length > 0) {
                filterClauses.push({
                    brand: { $in: brands.map(b => new RegExp('^' + b + '$', 'i')) }
                });
            }
        }

        if (capacity) {
            const capacities = capacity.split(',').map(c => parseInt(c.trim())).filter(c => !isNaN(c));
            if (capacities.length > 0) {
                filterClauses.push({
                    $or: [
                        { capacity: { $in: capacities } },
                        { capacityBtu: { $in: capacities } }
                    ]
                });
            }
        }

        if (minPrice !== undefined || maxPrice !== undefined) {
            const priceCondition = {};
            if (minPrice !== undefined) {
                const min = parseFloat(minPrice);
                if (isNaN(min)) return res.status(400).json({ success: false, message: 'Invalid minPrice parameter' });
                priceCondition.$gte = min;
            }
            if (maxPrice !== undefined) {
                const max = parseFloat(maxPrice);
                if (isNaN(max)) return res.status(400).json({ success: false, message: 'Invalid maxPrice parameter' });
                priceCondition.$lte = max;
            }
            filterClauses.push({
                $or: [
                    { price: priceCondition },
                    { 'pricing.sellingPricePerUnit': priceCondition },
                    { unitCost: priceCondition }
                ]
            });
        }

        const filter = filterClauses.length > 1 ? { $and: filterClauses } : filterClauses[0];

        const total = await Inventory.countDocuments(filter);
        const totalPages = Math.ceil(total / limitNum) || 1;
        const skip = (pageNum - 1) * limitNum;

        const inventoryItems = await Inventory.find(filter)
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limitNum);

        const products = inventoryItems.map(mapInventoryToProduct);

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

// GET /api/products/filters/options — Fetch dynamic filter options from Inventory
const getFilterOptions = async (req, res) => {
    try {
        const acFilter = {
            $or: [
                { category: 'AC Equipment' },
                { itemClass: 'AC Equipment' }
            ]
        };

        const [brands, subcategories, capacities, priceStats] = await Promise.all([
            Inventory.distinct('brand', acFilter),
            Inventory.distinct('subcategory', acFilter),
            Inventory.distinct('capacityBtu', acFilter),
            Inventory.aggregate([
                { $match: acFilter },
                {
                    $group: {
                        _id: null,
                        min: { $min: { $ifNull: ['$pricing.sellingPricePerUnit', '$price'] } },
                        max: { $max: { $ifNull: ['$pricing.sellingPricePerUnit', '$price'] } }
                    }
                }
            ])
        ]);

        const defaultCategories = [
            'Split Indoor Unit',
            'Split Outdoor Unit',
            'Cassette Unit',
            'Ducted Unit',
            'Multi-Split / VRF Unit',
            'Fan-Coil / Air-Handling Unit',
            'Packaged / Rooftop Unit'
        ];
        const discoveredCategories = subcategories.filter(Boolean);
        const combinedCategories = Array.from(new Set([...discoveredCategories, ...defaultCategories]));

        const priceRange = (priceStats.length > 0 && priceStats[0].min !== undefined)
            ? { min: priceStats[0].min || 0, max: priceStats[0].max || 500000 }
            : { min: 0, max: 500000 };

        res.status(200).json({
            success: true,
            brands: brands.filter(Boolean).sort(),
            categories: combinedCategories.sort(),
            capacities: capacities.filter(Boolean).sort((a, b) => a - b),
            priceRange
        });
    } catch (error) {
        console.error('getFilterOptions error:', error);
        res.status(500).json({ success: false, message: 'Server error while fetching filter options' });
    }
};

// GET /api/products/:id — Fetch single product by ID (Inventory primary, Product fallback)
const getProductById = async (req, res) => {
    try {
        const { id } = req.params;

        if (!id.match(/^[0-9a-fA-F]{24}$/)) {
            return res.status(400).json({ success: false, message: 'Invalid product ID format' });
        }

        // Fetch SystemConfig for default warranty months from systemconfigs collection
        const sysConfig = await SystemConfig.findOne().lean();
        const defaultWarrantyMonths = sysConfig?.businessRules?.defaultWarrantyMonths || 24;

        // 1. Primary: check Inventory
        const inventoryItem = await Inventory.findById(id);
        if (inventoryItem) {
            const mapped = mapInventoryToProduct(inventoryItem);
            mapped.defaultWarrantyMonths = defaultWarrantyMonths;
            mapped.warrantyInfo = {
                ...(mapped.warrantyInfo || {}),
                defaultWarrantyMonths
            };
            return res.status(200).json({ success: true, data: mapped });
        }

        // 2. Fallback: check Product for legacy order references
        const product = await Product.findById(id);
        if (product) {
            const prodObj = product.toObject ? product.toObject() : product;
            prodObj.defaultWarrantyMonths = defaultWarrantyMonths;
            prodObj.warrantyInfo = {
                ...(prodObj.warrantyInfo || {}),
                defaultWarrantyMonths
            };
            return res.status(200).json({ success: true, data: prodObj });
        }

        return res.status(404).json({ success: false, message: 'Product not found' });
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

        let product = await Inventory.findById(id);
        if (!product) {
            product = await Product.findById(id);
        }
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
        product.reviews = product.reviews || [];
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

        const ratings = product.reviews.map(r => r.rating);
        product.reviewCount = ratings.length;
        product.averageRating = ratings.length > 0
            ? Math.round((ratings.reduce((a, b) => a + b, 0) / ratings.length) * 10) / 10
            : 0;

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

        let product = await Inventory.findById(id);
        if (!product) {
            product = await Product.findById(id);
        }
        if (!product) {
            return res.status(404).json({ success: false, message: 'Product not found' });
        }

        const review = product.reviews ? product.reviews.id(reviewId) : null;
        if (!review) {
            return res.status(404).json({ success: false, message: 'Review not found' });
        }

        // Author ownership check
        const userDisplayName = [req.user.fullName, req.user.lastName].filter(Boolean).join(' ').trim() || req.user.fullName;
        const isAuthor = (review.userId && review.userId.toString() === req.user._id.toString()) ||
                         (!review.userId && review.userName === userDisplayName);

        if (!isAuthor && req.user.role !== 'admin' && req.user.role !== 'super-admin' && req.user.role !== 'SUPER_ADMIN') {
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

        const ratings = product.reviews.map(r => r.rating);
        product.reviewCount = ratings.length;
        product.averageRating = ratings.length > 0
            ? Math.round((ratings.reduce((a, b) => a + b, 0) / ratings.length) * 10) / 10
            : 0;

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

        let product = await Inventory.findById(id);
        if (!product) {
            product = await Product.findById(id);
        }
        if (!product) {
            return res.status(404).json({ success: false, message: 'Product not found' });
        }

        const review = product.reviews ? product.reviews.id(reviewId) : null;
        if (!review) {
            return res.status(404).json({ success: false, message: 'Review not found' });
        }

        // Author ownership check
        const userDisplayName = [req.user.fullName, req.user.lastName].filter(Boolean).join(' ').trim() || req.user.fullName;
        const isAuthor = (review.userId && review.userId.toString() === req.user._id.toString()) ||
                         (!review.userId && review.userName === userDisplayName);

        if (!isAuthor && req.user.role !== 'admin' && req.user.role !== 'super-admin' && req.user.role !== 'SUPER_ADMIN') {
            return res.status(403).json({ success: false, message: 'You are not authorized to delete this review' });
        }

        product.reviews.pull(reviewId);

        const ratings = product.reviews.map(r => r.rating);
        product.reviewCount = ratings.length;
        product.averageRating = ratings.length > 0
            ? Math.round((ratings.reduce((a, b) => a + b, 0) / ratings.length) * 10) / 10
            : 0;

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

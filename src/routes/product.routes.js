const express = require('express');
const router = express.Router();
const {
    getAllProducts,
    getFilterOptions,
    getProductById,
    checkReviewEligibility,
    addProductReview,
    updateProductReview,
    deleteProductReview
} = require('../controllers/product.controller');
const { protect } = require('../middleware/protect');

// GET /api/products/filters/options  ← must come BEFORE /:id
router.get('/filters/options', getFilterOptions);

// GET /api/products
router.get('/', getAllProducts);

// GET /api/products/:id/review-eligibility  ← must come BEFORE /:id
router.get('/:id/review-eligibility', checkReviewEligibility);

// GET /api/products/:id
router.get('/:id', getProductById);

// Review Management — Protected (Verified Buyers & Authors)
router.post('/:id/reviews', protect, addProductReview);
router.put('/:id/reviews/:reviewId', protect, updateProductReview);
router.delete('/:id/reviews/:reviewId', protect, deleteProductReview);

module.exports = router;

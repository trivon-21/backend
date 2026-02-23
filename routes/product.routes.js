const express = require('express');
const router = express.Router();
const {
    getAllProducts,
    getFilterOptions,
    getProductById,
    createProduct
} = require('../controllers/product.controller');

// GET /api/products/filters/options  ← must come BEFORE /:id
router.get('/filters/options', getFilterOptions);

// GET /api/products
router.get('/', getAllProducts);

// GET /api/products/:id
router.get('/:id', getProductById);

// POST /api/products
router.post('/', createProduct);

module.exports = router;

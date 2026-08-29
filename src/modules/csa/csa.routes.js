const router = require('express').Router();
const controller = require('./csa.controller');

// Dashboard Overview & Products
router.get('/dashboard-stats', controller.getDashboardStats);
router.get('/products', controller.getProducts);

// Customers management
router.get('/customers', controller.getCustomers);
router.post('/customers', controller.createCustomer);
router.get('/customers/:id', controller.getCustomerById);

// Service tickets management
router.get('/service-tickets', controller.getServiceTickets);
router.post('/service-tickets', controller.createServiceTicket);
router.patch('/service-tickets/:id/status', controller.updateServiceTicketStatus);

// Inquiries & Customer Communication
router.get('/inquiries', controller.getInquiries);
router.post('/inquiries/:id/reply', controller.replyToInquiry);
router.patch('/inquiries/:id/status', controller.updateInquiryStatus);

module.exports = router;

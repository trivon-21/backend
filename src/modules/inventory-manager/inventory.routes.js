// src/routes/materialRequest.route.js
const express = require('express');
const router = express.Router();
const materialController = require('./inventory.controller');
const NewRequest = require('../shared/serviceRequest/NewRequest');
const ServiceRequest = require('../shared/serviceRequest/ServiceRequest');
const Installation = require('../shared/installation/Installation');
const Customer = require('../customer/customer.model');

router.get('/dropdown-tickets', materialController.getNewServiceTickets);
router.post('/submit-to-finance', materialController.sendToFinance);
router.patch('/:id/send-to-im', materialController.sendToInventoryManager);
router.patch('/:id/approve-finance', materialController.approveFinance);
router.patch('/:id/reject-finance', materialController.rejectFinance);
router.patch('/:id/cancel', materialController.cancelMaterialRequest);

router.get('/', async (req, res) => {
    try {
        const materialWorkflowStatusRegex = [/^\s*pending\s*$/i, /^\s*finance approved\s*$/i, /^\s*finance rejected\s*$/i, /^\s*sent to im\s*$/i];
        const toCustomerId = (value) => {
            if (!value) return null;
            if (typeof value === 'string') return value;
            if (typeof value === 'object') {
                if (value._id) return String(value._id);
                if (value.id) return String(value.id);
            }
            return String(value);
        };

        // 1. Get ServiceRequests and normalize status in application code.
        const serviceRequests = await ServiceRequest.find({
            status: { $in: materialWorkflowStatusRegex }
        })
            .populate('customerId', 'name email contactNo address')
            .sort({ createdAt: -1 })
            .lean();

        // 1b. Get Installations in the same materials workflow statuses.
        const installations = await Installation.collection.find({
            status: { $in: ['Pending', 'Finance Approved', 'Finance Rejected', 'Sent to IM'] }
        }).sort({ createdAt: -1 }).toArray();

        // 2. Get NewRequests (Status: New) and calculate warranty
        const newRequests = await NewRequest.find()
            .populate('customerId', 'name email contactNo address')
            .lean();

        // Build a reliable customer map for cases where customerId is present but not fully populated.
        const customerIds = Array.from(new Set([
            ...serviceRequests.map((item) => toCustomerId(item.customerId)),
            ...installations.map((item) => toCustomerId(item.customerId)),
            ...newRequests.map((item) => toCustomerId(item.customerId))
        ].filter(Boolean)));

        const customers = customerIds.length > 0
            ? await Customer.find({ _id: { $in: customerIds } }).lean()
            : [];
        const customerById = new Map(customers.map((customer) => [String(customer._id), customer]));

        const serviceRequestsFormatted = serviceRequests
            .map((item) => {
                const customerId = toCustomerId(item.customerId);
                const populatedCustomer = item.customerId && typeof item.customerId === 'object' ? item.customerId : null;
                const customer = (customerId && customerById.get(customerId)) || populatedCustomer;

                return {
                    ...item,
                    ticketId: item._id,
                    customerName: customer?.name || item.customerName || 'Unknown Customer',
                    customerEmail: customer?.email || '-',
                    customerContactNo: customer?.contactNo || '-',
                    location: customer?.address || item.location || '-',
                    requestType: 'Service'
                };
            });

        const installationsFormatted = installations
            .map((item) => {
                const customerId = toCustomerId(item.customerId);
                const populatedCustomer = item.customerId && typeof item.customerId === 'object' ? item.customerId : null;
                const customer = (customerId && customerById.get(customerId)) || populatedCustomer;

                return {
                    ...item,
                    ticketId: item._id,
                    customerName: customer?.name || item.customerName || 'Unknown Customer',
                    customerEmail: customer?.email || '-',
                    customerContactNo: customer?.contactNo || '-',
                    location: customer?.address || item.location || '-',
                    requestType: 'Installation'
                };
            });

        const newRequestsFormatted = await Promise.all(newRequests.map(async (req) => {
            let isUnderWarranty = false;
            let isFreeOfCharge = false;
            const customerId = toCustomerId(req.customerId);
            const populatedCustomer = req.customerId && typeof req.customerId === 'object' ? req.customerId : null;
            const customer = (customerId && customerById.get(customerId)) || populatedCustomer;
            const customerObjectId = customerId || req.customerId;

            const installation = await Installation.findOne({ customerId: customerObjectId, status: 'Completed' }).lean();
            if (installation) {
                const installDate = new Date(installation.serviceDate || installation.date);
                const twoYearsLater = new Date(installDate);
                twoYearsLater.setFullYear(twoYearsLater.getFullYear() + 2);
                isUnderWarranty = new Date() <= twoYearsLater;

                const completedCount = await ServiceRequest.countDocuments({
                    customerId: customerObjectId,
                    status: 'Completed',
                    createdAt: { $gte: installDate, $lte: twoYearsLater }
                });
                isFreeOfCharge = isUnderWarranty && completedCount < 3;
            }

            return {
                ...req,
                ticketId: req._id,
                customerName: customer?.name || 'Unknown Customer',
                customerEmail: customer?.email || '-',
                customerContactNo: customer?.contactNo || '-',
                location: customer?.address || req.location || '-',
                status: 'New',
                requestType: 'Service',
                isUnderWarranty,
                isFreeOfCharge
            };
        }));

        const allRequests = [...serviceRequestsFormatted, ...installationsFormatted, ...newRequestsFormatted].sort((a, b) => 
            new Date(b.createdAt) - new Date(a.createdAt)
        );

        res.json({ success: true, data: allRequests });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

module.exports = router;
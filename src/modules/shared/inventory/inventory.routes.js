const express = require('express');
const router = express.Router();
const materialController = require('./inventory.controller');
const NewRequest = require('../serviceRequest/newRequest.model');
const ServiceRequest = require('../serviceRequest/serviceRequest.model');
const Installation = require('../installation/installation.model');
const Customer = require('../../customer/customer.model');
const { calculateWarrantyStatus } = require('../../../utils/warranty.utils');
const {
    WORKFLOW_STATUS,
    EXECUTION_STATUS,
    REQUEST_TYPES,
    STATUS_GROUPS,
    DEFAULTS,
} = require('../../../constants/enums');

router.get('/dropdown-tickets', materialController.getNewServiceTickets);
router.post('/submit-to-finance', materialController.sendToFinance);
router.patch('/:id/send-to-im', materialController.sendToInventoryManager);
router.patch('/:id/approve-finance', materialController.approveFinance);
router.patch('/:id/reject-finance', materialController.rejectFinance);
router.patch('/:id/cancel', materialController.cancelMaterialRequest);

router.get('/', async (req, res) => {
    try {
        const materialWorkflowStatusRegex = [
            new RegExp(`^\\s*${WORKFLOW_STATUS.PENDING}\\s*$`, 'i'),
            new RegExp(`^\\s*${WORKFLOW_STATUS.FINANCE_APPROVED}\\s*$`, 'i'),
            new RegExp(`^\\s*${WORKFLOW_STATUS.FINANCE_REJECTED}\\s*$`, 'i'),
            new RegExp(`^\\s*${WORKFLOW_STATUS.SENT_TO_IM}\\s*$`, 'i')
        ];
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
            status: { $in: STATUS_GROUPS.MATERIAL_WORKFLOW_VISIBLE }
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
                    customerName: customer?.name || item.customerName || DEFAULTS.UNKNOWN_CUSTOMER,
                    customerEmail: customer?.email || '-',
                    customerContactNo: customer?.contactNo || '-',
                    location: customer?.address || item.location || '-',
                    requestType: REQUEST_TYPES.SERVICE
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
                    customerName: customer?.name || item.customerName || DEFAULTS.UNKNOWN_CUSTOMER,
                    customerEmail: customer?.email || '-',
                    customerContactNo: customer?.contactNo || '-',
                    location: customer?.address || item.location || '-',
                    requestType: REQUEST_TYPES.INSTALLATION
                };
            });

        const newRequestsFormatted = await Promise.all(newRequests.map(async (req) => {
            const customerId = toCustomerId(req.customerId);
            const populatedCustomer = req.customerId && typeof req.customerId === 'object' ? req.customerId : null;
            const customer = (customerId && customerById.get(customerId)) || populatedCustomer;
            const customerObjectId = customerId || req.customerId;

            // Calculate warranty status for this customer
            const { isUnderWarranty, isFreeOfCharge } = await calculateWarrantyStatus(customerObjectId);

            return {
                ...req,
                ticketId: req._id,
                customerName: customer?.name || DEFAULTS.UNKNOWN_CUSTOMER,
                customerEmail: customer?.email || '-',
                customerContactNo: customer?.contactNo || '-',
                location: customer?.address || req.location || '-',
                status: WORKFLOW_STATUS.NEW,
                requestType: REQUEST_TYPES.SERVICE,
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
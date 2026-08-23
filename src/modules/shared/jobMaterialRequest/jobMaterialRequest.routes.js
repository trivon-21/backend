const express = require('express');
const router = express.Router();
const materialController = require('./jobMaterialRequest.controller');
const NewRequest = require('../serviceTicket/serviceTicket.model');
const ServiceRequest = require('../repair/repair.model');
const Installation = require('../installation/installation.model');
const Customer = require('../../user/user.model');
const Maintenance = require('../maintenance/maintenance.model');
const { calculateWarrantyStatus } = require('../../../utils/warranty.utils');
const {
    WORKFLOW_STATUS,
    EXECUTION_STATUS,
    MAINTENANCE_STATUS,
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
            .populate('customerId', 'fullName email phoneNumber address')
            .sort({ createdAt: -1 })
            .lean();

        // 1b. Get Installations in the same materials workflow statuses.
        const installations = await Installation.collection.find({
            status: { $in: STATUS_GROUPS.MATERIAL_WORKFLOW_VISIBLE }
        }).sort({ createdAt: -1 }).toArray();

        // 1c. Get Maintenances in the materials workflow statuses
        const materialMaintenanceStatusRegex = [
            new RegExp(`^\\s*${MAINTENANCE_STATUS.PENDING}\\s*$`, 'i'),
            new RegExp(`^\\s*${MAINTENANCE_STATUS.FINANCE_APPROVED}\\s*$`, 'i'),
            new RegExp(`^\\s*${MAINTENANCE_STATUS.FINANCE_REJECTED}\\s*$`, 'i'),
            new RegExp(`^\\s*${MAINTENANCE_STATUS.SENT_TO_IM}\\s*$`, 'i')
        ];
        const maintenances = await Maintenance.find({
            status: { $in: materialMaintenanceStatusRegex }
        })
            .populate('customerId', 'fullName email phoneNumber address')
            .sort({ createdAt: -1 })
            .lean();

        // 2. Get NewRequests (Status: New) and calculate warranty
        const newRequests = await NewRequest.find()
            .populate('customerId', 'fullName email phoneNumber address')
            .lean();

        // Build a reliable customer map for cases where customerId is present but not fully populated.
        const customerIds = Array.from(new Set([
            ...serviceRequests.map((item) => toCustomerId(item.customerId)),
            ...installations.map((item) => toCustomerId(item.customerId)),
            ...maintenances.map((item) => toCustomerId(item.customerId)),
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
                    customerName: customer?.fullName || item.customerName || item.fullName || DEFAULTS.UNKNOWN_CUSTOMER,
                    customerEmail: customer?.email || item.customerEmail || '-',
                    customerContactNo: customer?.phoneNumber || item.customerContactNo || item.customerPhone || '-',
                    location: customer?.address || item.location || item.customerAddress || '-',
                    requestType: item.serviceType || 'Repair'
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
                    customerName: customer?.fullName || item.customerName || item.fullName || DEFAULTS.UNKNOWN_CUSTOMER,
                    customerEmail: customer?.email || item.customerEmail || '-',
                    customerContactNo: customer?.phoneNumber || item.customerContactNo || item.customerPhone || '-',
                    location: customer?.address || item.location || item.customerAddress || '-',
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
                customerName: customer?.fullName || req.customerName || req.fullName || DEFAULTS.UNKNOWN_CUSTOMER,
                customerEmail: customer?.email || req.customerEmail || '-',
                customerContactNo: customer?.phoneNumber || req.customerContactNo || req.customerPhone || '-',
                location: customer?.address || req.location || req.customerAddress || '-',
                    status: WORKFLOW_STATUS.NEW,
                    serviceType: req.serviceType || req.requestType || req.request_type || 'Repair',
                    requestType: req.serviceType === 'Maintenance' ? 'Maintenance' : 'Repair',
                isUnderWarranty,
                isFreeOfCharge
            };
        }));

        const maintenancesFormatted = maintenances
            .map((item) => {
                const customerId = toCustomerId(item.customerId);
                const populatedCustomer = item.customerId && typeof item.customerId === 'object' ? item.customerId : null;
                const customer = (customerId && customerById.get(customerId)) || populatedCustomer;

                return {
                    ...item,
                    ticketId: item._id,
                    customerName: customer?.fullName || item.customerName || item.fullName || DEFAULTS.UNKNOWN_CUSTOMER,
                    customerEmail: customer?.email || item.customerEmail || '-',
                    customerContactNo: customer?.phoneNumber || item.customerContactNo || item.customerPhone || '-',
                    location: customer?.address || item.location || item.customerAddress || '-',
                    requestType: 'Maintenance',
                    serviceType: 'Maintenance',
                    materials: item.materialList || []
                };
            });

        const allRequests = [...serviceRequestsFormatted, ...installationsFormatted, ...newRequestsFormatted, ...maintenancesFormatted].sort((a, b) => 
            new Date(b.createdAt) - new Date(a.createdAt)
        );

        res.json({ success: true, data: allRequests });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});
        
const { body, validationResult } = require('express-validator');

// Insert this specific validation chain
const validateMaterialSubmission = [
  body('newRequestId').notEmpty().withMessage('Ticket ID is required'),
  body('materials').isArray({ min: 1 }).withMessage('At least one material is required'),
  (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }
    next();
  }
];

// Apply it here:
router.post('/submit-to-finance', validateMaterialSubmission, materialController.sendToFinance);

module.exports = router;



const Installation = require('../modules/shared/installation/installation.model');
const ServiceTicket = require('../models/ServiceRequest');
const { EXECUTION_STATUS } = require('../constants/enums');

/**
 * Calculates warranty status for a customer.
 * Checks if under warranty and if eligible for free service based on service type.
 * 
 * Warranty rules:
 * - 2 year warranty from installation completion date
 * - First 2 Repair services within warranty period are free
 * - First 4 Maintenance services within warranty period are free
 * 
 * @param {string|ObjectId} customerObjectId - Customer ID to check warranty for
 * @param {string} [serviceType] - 'Repair' or 'Maintenance'
 * @returns {Promise<{isUnderWarranty: boolean, isFreeOfCharge: boolean}>}
 */
exports.calculateWarrantyStatus = async (customerObjectId, serviceType) => {
  try {
    let isUnderWarranty = false;
    let isFreeOfCharge = false;

    // Find the most recent completed installation for this customer
    const installation = await Installation.findOne({
      customerId: customerObjectId,
      status: EXECUTION_STATUS.COMPLETED
    }).sort({ createdAt: -1 }).lean();

    if (installation) {
      // Calculate warranty period: 2 years from installation date
      const installDate = new Date(installation.serviceDate || installation.date);
      const warrantyExpiryDate = new Date(installDate);
      warrantyExpiryDate.setFullYear(warrantyExpiryDate.getFullYear() + 2);

      // Check if current date is within warranty period
      isUnderWarranty = new Date() <= warrantyExpiryDate;

      if (isUnderWarranty && serviceType) {
        // Count services completed within warranty period matching this serviceType
        const completedCount = await ServiceTicket.countDocuments({
          customerId: customerObjectId,
          status: 'Completed',
          serviceType: serviceType,
          createdAt: { $gte: installDate, $lte: warrantyExpiryDate }
        });

        if (serviceType === 'Repair') {
          // First 2 repairs are free
          isFreeOfCharge = completedCount < 2;
        } else if (serviceType === 'Maintenance') {
          // First 4 maintenances are free
          isFreeOfCharge = completedCount < 4;
        }
      }
    }

    return { isUnderWarranty, isFreeOfCharge };
  } catch (err) {
    console.error('Error calculating warranty status:', err);
    return { isUnderWarranty: false, isFreeOfCharge: false };
  }
};

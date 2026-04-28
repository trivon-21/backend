const Installation = require('../modules/shared/installation/installation.model');
const ServiceRequest = require('../modules/shared/serviceRequest/serviceRequest.model');
const { EXECUTION_STATUS } = require('../constants/enums');

/**
 * Calculates warranty status for a customer.
 * Checks if under warranty and if eligible for free service.
 * 
 * Warranty rules:
 * - 2 year warranty from installation completion date
 * - First 3 services within warranty period are free
 * 
 * @param {string|ObjectId} customerObjectId - Customer ID to check warranty for
 * @returns {Promise<{isUnderWarranty: boolean, isFreeOfCharge: boolean}>}
 */
exports.calculateWarrantyStatus = async (customerObjectId) => {
  try {
    let isUnderWarranty = false;
    let isFreeOfCharge = false;

    // Find the most recent completed installation for this customer
    const installation = await Installation.findOne({
      customerId: customerObjectId,
      status: EXECUTION_STATUS.COMPLETED
    }).lean();

    if (installation) {
      // Calculate warranty period: 2 years from installation date
      const installDate = new Date(installation.serviceDate || installation.date);
      const warrantyExpiryDate = new Date(installDate);
      warrantyExpiryDate.setFullYear(warrantyExpiryDate.getFullYear() + 2);

      // Check if current date is within warranty period
      isUnderWarranty = new Date() <= warrantyExpiryDate;

      // Count services completed within warranty period
      const completedWithinWarranty = await ServiceRequest.countDocuments({
        customerId: customerObjectId,
        status: EXECUTION_STATUS.COMPLETED,
        createdAt: { $gte: installDate, $lte: warrantyExpiryDate }
      });

      // First 3 services are free
      isFreeOfCharge = isUnderWarranty && completedWithinWarranty < 3;
    }

    return { isUnderWarranty, isFreeOfCharge };
  } catch (err) {
    console.error('Error calculating warranty status:', err);
    return { isUnderWarranty: false, isFreeOfCharge: false };
  }
};

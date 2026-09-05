const Installation = require('../modules/shared/installation/installation.model');
const Repair = require('../modules/shared/repair/repair.model');
const Maintenance = require('../modules/shared/maintenance/maintenance.model');
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
    }).sort({ serviceDate: -1, date: -1, createdAt: -1 }).lean();

    if (installation) {
      // Calculate warranty period: 2 years from installation date
      const installDate = new Date(installation.serviceDate || installation.date || installation.createdAt);
      
      // Safety check for invalid dates
      if (!isNaN(installDate.getTime())) {
        const warrantyExpiryDate = new Date(installDate);
        warrantyExpiryDate.setFullYear(warrantyExpiryDate.getFullYear() + 2);

        // Check if current date is within warranty period
        isUnderWarranty = new Date() <= warrantyExpiryDate;

        if (isUnderWarranty && serviceType) {
          let completedCount = 0;
          
          if (serviceType === 'Repair') {
            completedCount = await Repair.countDocuments({
              customerId: customerObjectId,
              status: EXECUTION_STATUS.COMPLETED,
              createdAt: { $gte: installDate, $lte: warrantyExpiryDate }
            });
            // First 2 repairs are free
            isFreeOfCharge = completedCount < 2;
          } else if (serviceType === 'Maintenance') {
            completedCount = await Maintenance.countDocuments({
              customerId: customerObjectId,
              status: EXECUTION_STATUS.COMPLETED,
              createdAt: { $gte: installDate, $lte: warrantyExpiryDate }
            });
            // First 4 maintenances are free
            isFreeOfCharge = completedCount < 4;
          }
        }
      } else {
        console.warn(`[warranty.utils] Invalid installation date for customer ${customerObjectId}`);
      }
    }
    
    return { isUnderWarranty, isFreeOfCharge };
  } catch (err) {
    console.error('Error calculating warranty status:', err);
    throw err; // Let upstream handle the error instead of swallowing it
  }
};

/**
 * Returns the standard 6-service template for a new MaintenanceSchedule.
 *
 * Schedule spans 3 years from the installation date:
 *   Services 1-4  →  Under Warranty
 *   Services 5-6  →  Post-Warranty
 *
 * Dates are left null until the technician fills them in.
 */
const buildServiceTemplate = () => [
  { serviceName: 'First Service',  date: null, underWarranty: true  },
  { serviceName: 'Second Service', date: null, underWarranty: true  },
  { serviceName: 'Third Service',  date: null, underWarranty: true  },
  { serviceName: 'Fourth Service', date: null, underWarranty: true  },
  { serviceName: 'Fifth Service',  date: null, underWarranty: false },
  { serviceName: 'Sixth Service',  date: null, underWarranty: false },
];

/**
 * Returns a Date that is exactly 3 years after the given installation date.
 * @param {Date|string} installationDate
 * @returns {Date}
 */
const buildScheduleEndDate = (installationDate) => {
  const d = new Date(installationDate);
  d.setFullYear(d.getFullYear() + 3);
  return d;
};

module.exports = { buildServiceTemplate, buildScheduleEndDate };

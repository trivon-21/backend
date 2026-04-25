const { DEFAULT_TASK_DETAILS } = require('../config/defaults.config');

/**
 * Builds the task payload returned to the assigned-jobs list view.
 * This central formatter keeps API contracts stable across controllers.
 * @param {object} params
 * @returns {object}
 */
const formatTaskListItem = ({
  job,
  type,
  customer,
  location,
  serviceType,
  scheduledDate,
  assignedTeam,
}) => ({
  id: job.ticketId || String(job._id),
  type,
  customer,
  location,
  serviceType,
  status: job.status,
  scheduledDate,
  assignedTeam,
});

/**
 * Builds the full task details payload consumed by the details screen.
 * Keeping defaults in one place prevents silent drift across endpoints.
 * @param {object} params
 * @returns {object}
 */
const formatTaskDetailItem = ({
  id,
  sourceId,
  type,
  status,
  assignedTeam,
  customer,
  location,
  scheduledDate,
  productType,
  detailedProductType,
  description,
  notesFromTechnician,
  materials,
}) => ({
  id,
  sourceId,
  type,
  status,
  assignedTeam,
  customer,
  location,
  scheduledDate,
  serviceType: productType || DEFAULT_TASK_DETAILS.serviceType,
  detailedProductType: detailedProductType || DEFAULT_TASK_DETAILS.detailedProductType,
  description: description || DEFAULT_TASK_DETAILS.description,
  notesFromTechnician: notesFromTechnician || DEFAULT_TASK_DETAILS.notesFromTechnician,
  materials: Array.isArray(materials) && materials.length > 0 ? materials : DEFAULT_TASK_DETAILS.materials,
});

module.exports = {
  formatTaskListItem,
  formatTaskDetailItem,
};

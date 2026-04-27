const {
  WORKFLOW_STATUS,
  EXECUTION_STATUS,
} = require('../constants/enums');

module.exports = {
  ROLES: {
    SUPER_ADMIN: 'super-admin',
    TECHNICIAN: 'technician',
    MANAGER: 'manager'
  },
  STATUS: {
    PENDING: WORKFLOW_STATUS.PENDING,
    IN_PROGRESS: EXECUTION_STATUS.IN_PROGRESS,
    COMPLETED: EXECUTION_STATUS.COMPLETED
  }
};

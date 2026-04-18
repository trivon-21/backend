// Role constants
const ROLES = {
  CUSTOMER: 'CUSTOMER',
  CSA: 'CSA',
  INSPECTION: 'INSPECTION',
  MAIN_TECH: 'MAIN_TECH',
  SERVICE_TEAM: 'SERVICE_TEAM',
  FINANCE: 'FINANCE',
  INVENTORY: 'INVENTORY',
  MANAGER: 'MANAGER'
};

// Order status constants
const ORDER_STATUS = {
  ORDER_PLACED: 'Order Placed',
  PAYMENT_UPLOADED: 'Payment Uploaded',
  PAYMENT_CONFIRMED: 'Payment Confirmed',
  INVENTORY_APPROVED: 'Inventory Approved',
  SHIPPED: 'Shipped',
  DELIVERED: 'Delivered',
  INSTALLATION_SCHEDULED: 'Installation Scheduled',
  INSTALLATION_COMPLETED: 'Installation Completed'
};

const ORDER_STATUS_LEGACY = {
  COMPLETED: 'Completed',
  PENDING: 'Pending',
  RETURNED: 'Returned'
};

// Service Request status constants
const SERVICE_REQUEST_STATUS = {
  PENDING: 'Pending',
  ASSIGNED: 'Assigned',
  IN_PROGRESS: 'In Progress',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled'
};

// Service types
const SERVICE_TYPES = {
  REPAIR: 'Repair',
  GENERAL_SERVICE: 'General Service',
  GAS_REFILL: 'Gas Refill',
  INSTALLATION_ISSUE: 'Installation Issue',
  AMC_SERVICE: 'AMC Service',
  OTHER: 'Other'
};

// Inquiry status constants
const INQUIRY_STATUS = {
  ONGOING: 'Ongoing',
  ADDRESSED: 'Addressed',
  CLOSED: 'Closed'
};

// Inquiry types
const INQUIRY_TYPES = {
  PRODUCT: 'Product',
  PRICING: 'Pricing',
  INSTALLATION: 'Installation',
  WARRANTY: 'Warranty',
  AMC: 'AMC',
  OTHER: 'Other'
};

// Feedback categories
const FEEDBACK_CATEGORIES = {
  ORDER: 'Order',
  INSTALLATION: 'Installation',
  SERVICE: 'Service',
  AMC_SERVICE: 'AMC Service Visit'
};

// Audit action types
const AUDIT_ACTIONS = {
  LOGIN: 'LOGIN',
  LOGOUT: 'LOGOUT',
  CREATE_ORDER: 'CREATE_ORDER',
  UPDATE_ORDER: 'UPDATE_ORDER',
  CANCEL_ORDER: 'CANCEL_ORDER',
  CREATE_SERVICE_REQUEST: 'CREATE_SERVICE_REQUEST',
  CANCEL_SERVICE_REQUEST: 'CANCEL_SERVICE_REQUEST',
  CREATE_INQUIRY: 'CREATE_INQUIRY',
  REPLY_INQUIRY: 'REPLY_INQUIRY',
  CREATE_FEEDBACK: 'CREATE_FEEDBACK',
  UPDATE_PROFILE: 'UPDATE_PROFILE',
  CHANGE_PASSWORD: 'CHANGE_PASSWORD',
  UPLOAD_PHOTO: 'UPLOAD_PHOTO',
  DELETE_ACCOUNT: 'DELETE_ACCOUNT',
  ADD_EMAIL: 'ADD_EMAIL',
  REMOVE_EMAIL: 'REMOVE_EMAIL',
  VERIFY_EMAIL: 'VERIFY_EMAIL'
};

module.exports = {
  ROLES,
  ORDER_STATUS,
  ORDER_STATUS_LEGACY,
  SERVICE_REQUEST_STATUS,
  SERVICE_TYPES,
  INQUIRY_STATUS,
  INQUIRY_TYPES,
  FEEDBACK_CATEGORIES,
  AUDIT_ACTIONS
};

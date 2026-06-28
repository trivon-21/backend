//
const isNonEmptyString = (value) => typeof value === 'string' && value.trim().length > 0;

// Add these for your form validation:
const isValidEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
const isValidPhone = (phone) => /^\d{10,15}$/.test(phone);

module.exports = {
  isNonEmptyString,
  isValidEmail,
  isValidPhone
};
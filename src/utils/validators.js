const isNonEmptyString = (value) => typeof value === 'string' && value.trim().length > 0;

module.exports = {
  isNonEmptyString
};

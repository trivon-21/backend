module.exports = (_allowedRoles = []) => {
  return (req, res, next) => {
    next();
  };
};

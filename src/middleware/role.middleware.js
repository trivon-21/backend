function authorize(roles) {
  const allowedRoles = new Set(roles);
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ message: 'Not authenticated' });
    if (!allowedRoles.has(req.user.role)) {
      return res.status(403).json({ message: 'You are not allowed to access this resource' });
    }
    return next();
  };
}

module.exports = { authorize };

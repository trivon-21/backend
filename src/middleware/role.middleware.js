/**
 * Authorization middleware for role-based access control
 * Usage: router.post("/endpoint", authorize(['MANAGER', 'CSA']), controllerFunc);
 */
const authorize = (requiredRoles = []) => {
  return (req, res, next) => {
    const user = req.user;

    if (!user) {
      return res.status(401).json({ message: 'Unauthorized. User not found.' });
    }

    if (!requiredRoles.includes(user.role)) {
      return res.status(403).json({
        message: `Access denied. Required role(s): ${requiredRoles.join(', ')}`
      });
    }

    next();
  };
};

module.exports = { authorize };

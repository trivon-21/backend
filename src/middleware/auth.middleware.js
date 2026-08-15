const { validationResult } = require("express-validator");
const jwt = require('jsonwebtoken');

exports.validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ message: "Validation failed", errors: errors.array() });
  }
  next();
};

/**
 * Middleware to verify JWT and check user roles
 * @param {Array} allowedRoles - List of roles that can access the route
 */
exports.authorize = (allowedRoles = []) => {
  return (req, res, next) => {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ 
        success: false, 
        message: 'No token provided. Authorization denied.' 
      });
    }

    const token = authHeader.split(' ')[1];

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'airlux_secret_key');
      req.user = decoded;

      if (allowedRoles.length && !allowedRoles.includes(req.user.userRole)) {
        return res.status(403).json({ 
          success: false, 
          message: 'Access denied. You do not have the required permissions.' 
        });
      }

      next();
    } catch (err) {
      res.status(401).json({ 
        success: false, 
        message: 'Invalid or expired token.' 
      });
    }
  };
};

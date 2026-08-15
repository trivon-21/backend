const jwt = require('jsonwebtoken');

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
      // Use JWT_SECRET from .env or a default for development
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

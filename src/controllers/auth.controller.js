const jwt = require('jsonwebtoken');

// Simple mock login for development/testing purposes
exports.mockLogin = (req, res) => {
  const { username, role } = req.body;
  
  if (!username || !role) {
    return res.status(400).json({ success: false, message: 'Username and role are required' });
  }

  const payload = {
    id: '507f1f77bcf86cd799439011', // Valid 24-character hex ObjectId
    username: username,
    userRole: role // e.g. 'Super Admin' or 'Finance Officer'
  };

  const token = jwt.sign(payload, process.env.JWT_SECRET || 'airlux_secret_key', { expiresIn: '1d' });

  res.json({
    success: true,
    token: token,
    user: payload
  });
};

const jwt = require('jsonwebtoken');
const { pool } = require('../models/database');

const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret-change-me';

// Generate JWT token
const generateToken = (user) => {
  return jwt.sign(
    { id: user.id, email: user.email, role: user.role },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
};

// Verify JWT token middleware
const authenticate = async (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided' });
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, JWT_SECRET);

    // Get fresh user data
    const result = await pool.query(
      'SELECT id, email, name, role, notify_email FROM users WHERE id = $1',
      [decoded.id]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'User not found' });
    }

    req.user = result.rows[0];
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Invalid token' });
  }
};

// Admin only middleware
const adminOnly = (req, res, next) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
};

// Role-based permissions configuration
const ROLE_PERMISSIONS = {
  admin: ['*'], // Full access
  marketing: [
    'dashboard',
    'announcements',
    'campaigns',
    'channels',
    'analytics',
    'click-details',
    'insights'
  ],
  support: [
    'dashboard',
    'inbox',
    'tickets',
    'customers',
    'quick-replies',
    'logs'
  ]
};

// Check if user has permission for a specific feature
const hasPermission = (role, feature) => {
  if (!role || !ROLE_PERMISSIONS[role]) return false;
  if (ROLE_PERMISSIONS[role].includes('*')) return true;
  return ROLE_PERMISSIONS[role].includes(feature);
};

// Middleware factory for checking feature access
const requirePermission = (feature) => {
  return (req, res, next) => {
    if (!hasPermission(req.user.role, feature)) {
      return res.status(403).json({ error: 'Access denied. Insufficient permissions.' });
    }
    next();
  };
};

// Marketing role middleware (admin or marketing)
const marketingAccess = (req, res, next) => {
  if (req.user.role !== 'admin' && req.user.role !== 'marketing') {
    return res.status(403).json({ error: 'Marketing access required' });
  }
  next();
};

// Support role middleware (admin or support)
const supportAccess = (req, res, next) => {
  if (req.user.role !== 'admin' && req.user.role !== 'support') {
    return res.status(403).json({ error: 'Support access required' });
  }
  next();
};

// Log activity
const logActivity = async (userId, action, details = null) => {
  try {
    await pool.query(
      'INSERT INTO activity_log (user_id, action, details) VALUES ($1, $2, $3)',
      [userId, action, details ? JSON.stringify(details) : null]
    );
  } catch (error) {
    console.error('Error logging activity:', error);
  }
};

module.exports = {
  generateToken,
  authenticate,
  adminOnly,
  logActivity,
  JWT_SECRET,
  ROLE_PERMISSIONS,
  hasPermission,
  requirePermission,
  marketingAccess,
  supportAccess
};

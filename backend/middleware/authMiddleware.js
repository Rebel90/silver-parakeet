const jwt = require('jsonwebtoken');
const db = require('../db/database').db;

const JWT_SECRET = process.env.JWT_SECRET || 'super-secret-key';

function authenticateToken(req, res, next) {
  // Try to get token from cookies or authorization header
  let token = req.cookies?.token;
  if (!token && req.headers.authorization) {
    token = req.headers.authorization.split(' ')[1];
  }

  if (!token) {
    return res.status(401).json({ error: 'Session expired. Please login again.' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Session expired. Please login again.' });
  }
}

function requireAdmin(req, res, next) {
  if (req.user && req.user.role === 'admin') {
    next();
  } else {
    res.status(403).json({ error: 'Forbidden. Admin access required.' });
  }
}

module.exports = { authenticateToken, requireAdmin, JWT_SECRET };

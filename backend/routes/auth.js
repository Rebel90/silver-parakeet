const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { db } = require('../db/database');
const { authenticateToken, requireAdmin, JWT_SECRET } = require('../middleware/authMiddleware');

const router = express.Router();

router.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body;
  
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password required' });
  }

  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  if (!user) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const validPassword = bcrypt.compareSync(password, user.password);
  if (!validPassword) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const token = jwt.sign(
    { id: user.id, username: user.username, role: user.role, force_change: user.force_change_password },
    JWT_SECRET,
    { expiresIn: '24h' }
  );

  res.cookie('token', token, {
    httpOnly: true,
    secure: true, // MUST be true for SameSite=None
    sameSite: 'none', // Required for cross-domain authenticated requests (e.g. Netlify to Railway)
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  });

  // Log activity
  db.prepare('INSERT INTO activity_logs (user_id, action, details, ip_address) VALUES (?, ?, ?, ?)').run(
    user.id,
    'login',
    'User logged in',
    req.ip
  );

  res.json({
    success: true,
    token: token,
    user: {
      id: user.id,
      username: user.username,
      role: user.role,
      force_change: user.force_change_password
    }
  });
});

router.post('/api/auth/logout', (req, res) => {
  res.clearCookie('token');
  res.json({ success: true, message: 'Logged out' });
});

router.get('/api/auth/me', authenticateToken, (req, res) => {
  const user = db.prepare('SELECT id, username, role, force_change_password, daily_limit FROM users WHERE id = ?').get(req.user.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json({
    id: user.id,
    username: user.username,
    role: user.role,
    force_change: user.force_change_password,
    daily_limit: user.daily_limit
  });
});

router.post('/api/auth/change-password', authenticateToken, (req, res) => {
  const { newPassword } = req.body;
  if (!newPassword || newPassword.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters' });
  }

  const hash = bcrypt.hashSync(newPassword, 10);
  db.prepare('UPDATE users SET password = ?, force_change_password = 0 WHERE id = ?').run(hash, req.user.id);
  
  res.json({ success: true });
});

module.exports = router;

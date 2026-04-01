const express = require('express');
const bcrypt = require('bcryptjs');
const { db } = require('../db/database');
const { authenticateToken, requireAdmin } = require('../middleware/authMiddleware');

const router = express.Router();

router.get('/api/admin/users', authenticateToken, requireAdmin, (req, res) => {
  const users = db.prepare('SELECT id, username, role, daily_limit, created_at FROM users ORDER BY created_at DESC').all();
  
  const stats = db.prepare(`
    SELECT u.id,
      (SELECT count(*) FROM stores s WHERE s.user_id = u.id) as stores_count,
      (SELECT sum(emails_sent_today) FROM usage_logs l WHERE l.user_id = u.id AND l.date = date('now')) as sent_today,
      (SELECT status FROM send_progress p WHERE p.user_id = u.id ORDER BY updated_at DESC LIMIT 1) as last_status,
      (SELECT updated_at FROM send_progress p WHERE p.user_id = u.id ORDER BY updated_at DESC LIMIT 1) as last_activity
    FROM users u
  `).all();

  const formattedStats = {};
  stats.forEach(s => formattedStats[s.id] = s);

  res.json(users.map(u => ({
    ...u,
    ...formattedStats[u.id],
    sent_today: formattedStats[u.id]?.sent_today || 0
  })));
});

router.post('/api/admin/users', authenticateToken, requireAdmin, (req, res) => {
  const { username, password, daily_limit } = req.body;
  
  if (!username || !password) return res.status(400).json({ error: 'Username and password required' });
  
  try {
    const hash = bcrypt.hashSync(password, 10);
    db.prepare('INSERT INTO users (username, password, role, daily_limit) VALUES (?, ?, ?, ?)').run(
      username, hash, 'member', daily_limit || null
    );
    res.json({ success: true });
  } catch (err) {
    if (err.message.includes('UNIQUE')) {
      return res.status(400).json({ error: 'Username already exists' });
    }
    res.status(500).json({ error: err.message });
  }
});

router.delete('/api/admin/users/:id', authenticateToken, requireAdmin, (req, res) => {
  const { id } = req.params;
  if (req.user.id == id) return res.status(400).json({ error: 'Cannot delete yourself' });
  
  db.prepare('DELETE FROM users WHERE id = ?').run(id);
  db.prepare('DELETE FROM stores WHERE user_id = ?').run(id);
  db.prepare('DELETE FROM send_progress WHERE user_id = ?').run(id);
  res.json({ success: true });
});

router.put('/api/admin/users/:id/limit', authenticateToken, requireAdmin, (req, res) => {
  const { id } = req.params;
  const { limit } = req.body;
  
  db.prepare('UPDATE users SET daily_limit = ? WHERE id = ?').run(limit === '' ? null : limit, id);
  res.json({ success: true });
});

router.post('/api/admin/users/:id/reset-password', authenticateToken, requireAdmin, (req, res) => {
  const { id } = req.params;
  const { newPassword } = req.body;
  
  if (!newPassword) return res.status(400).json({ error: 'Password required' });
  const hash = bcrypt.hashSync(newPassword, 10);
  
  db.prepare('UPDATE users SET password = ?, force_change_password = 1 WHERE id = ?').run(hash, id);
  res.json({ success: true });
});

module.exports = router;

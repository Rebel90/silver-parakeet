const Database = require('better-sqlite3');
const path = require('path');
const crypto = require('crypto');

// --- Configuration ---
const dbPath = path.join(__dirname, 'shopify_app.db');
const db = new Database(dbPath);

// Encryption Key should be 32 bytes for AES-256-CBC
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY;
const ALGORITHM = 'aes-256-cbc';
const IV_LENGTH = 16; 

// Initialize database schema
db.exec(`
  CREATE TABLE IF NOT EXISTS stores (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    api_name TEXT NOT NULL,
    shop_domain TEXT UNIQUE NOT NULL,
    access_token_encrypted TEXT NOT NULL,
    access_token_iv TEXT NOT NULL,
    max_orders INTEGER DEFAULT 100,
    usage_count INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
  )
`);

// TASK 1 — send_progress table for resume feature
db.exec(`
  CREATE TABLE IF NOT EXISTS send_progress (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL,
    shop_domain TEXT NOT NULL,
    email TEXT NOT NULL,
    row_index INTEGER NOT NULL,
    status TEXT DEFAULT 'pending',
    order_id TEXT,
    draft_order_id TEXT,
    error_message TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  )
`);

// Create index for fast lookups by session_id
db.exec(`
  CREATE INDEX IF NOT EXISTS idx_send_progress_session 
  ON send_progress(session_id)
`);

// TASK 7 — Clear old sessions on startup (older than 7 days)
function clearOldSessions() {
  const result = db.prepare(
    `DELETE FROM send_progress WHERE created_at < datetime('now', '-7 days')`
  ).run();
  if (result.changes > 0) {
    console.log(`[DB] Cleared ${result.changes} old session rows (>7 days)`);
  }
}

// Run cleanup on startup
clearOldSessions();

/**
 * Encrypts an access token
 */
function encrypt(text) {
  if (!ENCRYPTION_KEY) {
    console.warn('Warning: Missing ENCRYPTION_KEY in .env. Storing as plaintext.');
    return { iv: 'plaintext', encrypted: text };
  }
  
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, Buffer.from(ENCRYPTION_KEY), iv);
  let encrypted = cipher.update(text);
  encrypted = Buffer.concat([encrypted, cipher.final()]);
  return {
    iv: iv.toString('hex'),
    encrypted: encrypted.toString('hex')
  };
}

/**
 * Decrypts an access token
 */
function decrypt(encryptedText, ivHex) {
  if (!ENCRYPTION_KEY || ivHex === 'plaintext') return encryptedText;
  
  try {
    const iv = Buffer.from(ivHex, 'hex');
    const encrypted = Buffer.from(encryptedText, 'hex');
    const decipher = crypto.createDecipheriv(ALGORITHM, Buffer.from(ENCRYPTION_KEY), iv);
    let decrypted = decipher.update(encrypted);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    return decrypted.toString();
  } catch (err) {
    console.error('Decryption failed:', err.message);
    return encryptedText;
  }
}

// --- Store Operations ---

function addStore(api_name, shop_domain, access_token, max_orders = 100) {
  const { iv, encrypted } = encrypt(access_token);
  const stmt = db.prepare(`
    INSERT INTO stores (api_name, shop_domain, access_token_encrypted, access_token_iv, max_orders)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(shop_domain) DO UPDATE SET
      api_name = excluded.api_name,
      access_token_encrypted = excluded.access_token_encrypted,
      access_token_iv = excluded.access_token_iv,
      max_orders = excluded.max_orders
  `);
  return stmt.run(api_name, shop_domain, encrypted, iv, max_orders);
}

function getAllStores() {
  const rows = db.prepare('SELECT * FROM stores ORDER BY created_at DESC').all();
  return rows.map(row => ({
    id: row.id,
    api_name: row.api_name,
    shop_domain: row.shop_domain,
    access_token: decrypt(row.access_token_encrypted, row.access_token_iv),
    max_orders: row.max_orders,
    usage_count: row.usage_count,
    created_at: row.created_at
  }));
}

function getStoreByDomain(shop_domain) {
  const row = db.prepare('SELECT * FROM stores WHERE shop_domain = ?').get(shop_domain);
  if (!row) return null;
  
  return {
    id: row.id,
    api_name: row.api_name,
    shop_domain: row.shop_domain,
    access_token: decrypt(row.access_token_encrypted, row.access_token_iv),
    max_orders: row.max_orders,
    usage_count: row.usage_count,
    created_at: row.created_at
  };
}

function deleteStoreByDomain(shop_domain) {
  return db.prepare('DELETE FROM stores WHERE shop_domain = ?').run(shop_domain);
}

function deleteAllStores() {
  return db.prepare('DELETE FROM stores').run();
}

function incrementUsage(shop_domain) {
  return db.prepare('UPDATE stores SET usage_count = usage_count + 1 WHERE shop_domain = ?').run(shop_domain);
}

function resetAllUsage() {
  return db.prepare('UPDATE stores SET usage_count = 0').run();
}

// --- Send Progress Operations (RESUME FEATURE) ---

/**
 * TASK 2 — Generate a unique session ID for a CSV batch.
 * Same CSV on same day = same session_id (enables resume detection).
 */
function generateSessionId(rows, shopDomain) {
  const firstEmail = rows[0]?.email || '';
  const lastEmail = rows[rows.length - 1]?.email || '';
  const count = rows.length;
  const date = new Date().toDateString();

  const raw = `${firstEmail}-${lastEmail}-${count}-${shopDomain}-${date}`;

  // Simple hash
  let hash = 0;
  for (let i = 0; i < raw.length; i++) {
    hash = ((hash << 5) - hash) + raw.charCodeAt(i);
    hash = hash & hash;
  }

  return `session_${Math.abs(hash)}`;
}

/**
 * TASK 3 — Check if a session already has progress (resume detection).
 */
function checkExistingProgress(sessionId) {
  const existingRows = db.prepare(
    `SELECT * FROM send_progress WHERE session_id = ? ORDER BY row_index ASC`
  ).all(sessionId);

  if (existingRows.length === 0) {
    return {
      isResume: false,
      alreadySent: [],
      lastSentIndex: -1,
      totalSentSoFar: 0,
      totalFailed: 0,
      rows: []
    };
  }

  const alreadySent = existingRows
    .filter(r => r.status === 'sent')
    .map(r => r.row_index);

  const failedRows = existingRows
    .filter(r => r.status === 'failed')
    .map(r => r.row_index);

  const lastSentIndex = alreadySent.length > 0
    ? Math.max(...alreadySent)
    : -1;

  return {
    isResume: true,
    alreadySent,
    failedRows,
    lastSentIndex,
    totalSentSoFar: alreadySent.length,
    totalFailed: failedRows.length,
    rows: existingRows
  };
}

/**
 * Save all rows as "pending" for a fresh session.
 */
function initSessionRows(sessionId, shopDomain, rows) {
  const stmt = db.prepare(
    `INSERT INTO send_progress (session_id, shop_domain, email, row_index, status)
     VALUES (?, ?, ?, ?, 'pending')`
  );

  const insertMany = db.transaction((rows) => {
    for (let i = 0; i < rows.length; i++) {
      stmt.run(sessionId, shopDomain, rows[i].email, i);
    }
  });

  insertMany(rows);
}

/**
 * Update a row's status after send attempt.
 */
function updateRowProgress(sessionId, rowIndex, status, orderId, draftOrderId, errorMessage) {
  db.prepare(
    `UPDATE send_progress 
     SET status = ?, order_id = ?, draft_order_id = ?, error_message = ?, updated_at = datetime('now')
     WHERE session_id = ? AND row_index = ?`
  ).run(status, orderId || null, draftOrderId || null, errorMessage || null, sessionId, rowIndex);
}

/**
 * Delete all progress for a session (Start Fresh).
 */
function deleteSession(sessionId) {
  return db.prepare('DELETE FROM send_progress WHERE session_id = ?').run(sessionId);
}

/**
 * Clear ALL send progress history.
 */
function clearAllSendHistory() {
  return db.prepare('DELETE FROM send_progress').run();
}

/**
 * Get progress details for a specific row in a session.
 */
function getRowProgress(sessionId, rowIndex) {
  return db.prepare(
    `SELECT * FROM send_progress WHERE session_id = ? AND row_index = ?`
  ).get(sessionId, rowIndex);
}

module.exports = {
  addStore,
  getAllStores,
  getStoreByDomain,
  deleteStoreByDomain,
  deleteAllStores,
  incrementUsage,
  resetAllUsage,
  // Resume feature exports
  generateSessionId,
  checkExistingProgress,
  initSessionRows,
  updateRowProgress,
  deleteSession,
  clearAllSendHistory,
  clearOldSessions,
  getRowProgress
};

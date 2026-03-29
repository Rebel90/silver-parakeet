const Database = require('better-sqlite3');
const path = require('path');
const crypto = require('crypto');

// --- Configuration ---
const dbPath = path.join(__dirname, 'shopify_app.db');
const db = new Database(dbPath);

// Encryption Key should be 32 bytes for AES-256-CBC
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY;
const ALGORITHM = 'aes-256-cbc';
const IV_LENGTH = 16; // For AES, this is always 16

// Initialize database schema
db.exec(`
  CREATE TABLE IF NOT EXISTS stores (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    api_name TEXT NOT NULL,
    shop_domain TEXT UNIQUE NOT NULL,
    access_token TEXT NOT NULL,
    max_orders INTEGER DEFAULT 100,
    usage_count INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

/**
 * Encrypts an access token
 */
function encrypt(text) {
  if (!ENCRYPTION_KEY) {
    console.error('Missing ENCRYPTION_KEY in .env');
    return text; // Fallback if no key (not secure)
  }
  
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, Buffer.from(ENCRYPTION_KEY), iv);
  let encrypted = cipher.update(text);
  encrypted = Buffer.concat([encrypted, cipher.final()]);
  return iv.toString('hex') + ':' + encrypted.toString('hex');
}

/**
 * Decrypts an access token
 */
function decrypt(text) {
  if (!ENCRYPTION_KEY || !text.includes(':')) return text;
  
  try {
    const textParts = text.split(':');
    const iv = Buffer.from(textParts.shift(), 'hex');
    const encryptedText = Buffer.from(textParts.join(':'), 'hex');
    const decipher = crypto.createDecipheriv(ALGORITHM, Buffer.from(ENCRYPTION_KEY), iv);
    let decrypted = decipher.update(encryptedText);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    return decrypted.toString();
  } catch (err) {
    console.error('Decryption failed:', err.message);
    return text;
  }
}

// --- Database Operations ---

function addStore(api_name, shop_domain, access_token, max_orders = 100) {
  const encryptedToken = encrypt(access_token);
  const stmt = db.prepare(`
    INSERT INTO stores (api_name, shop_domain, access_token, max_orders)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(shop_domain) DO UPDATE SET
      api_name = excluded.api_name,
      access_token = excluded.access_token,
      max_orders = excluded.max_orders
  `);
  return stmt.run(api_name, shop_domain, encryptedToken, max_orders);
}

function getAllStores() {
  const stores = db.prepare('SELECT * FROM stores ORDER BY created_at DESC').all();
  return stores.map(store => ({
    ...store,
    access_token: decrypt(store.access_token)
  }));
}

function getStoreByDomain(shop_domain) {
  const store = db.prepare('SELECT * FROM stores WHERE shop_domain = ?').get(shop_domain);
  if (store) {
    store.access_token = decrypt(store.access_token);
  }
  return store;
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

module.exports = {
  addStore,
  getAllStores,
  getStoreByDomain,
  deleteStoreByDomain,
  deleteAllStores,
  incrementUsage,
  resetAllUsage
};

require('dotenv').config();

const express = require('express');
const cors = require('cors');
const path = require('path');
const cookieParser = require('cookie-parser');

const storeRoutes = require('./routes/stores');
const csvRoutes = require('./routes/csv');
const invoiceRoutes = require('./routes/invoice');
const logRoutes = require('./routes/logs');
const authRoutes = require('./routes/auth');
const adminRoutes = require('./routes/admin');

const app = express();

// 1. CORS — FIRST
app.use(cors({
  origin: [
    "https://shopify-emails.netlify.app",
    "http://localhost:3000",
    "http://localhost:5173",
    "http://localhost:3001"
  ],
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"]
}));
app.options("*", cors());

// 2. Body parser
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// 3. Request logger
app.use((req, res, next) => {
  const timestamp = new Date().toISOString();
  console.log(`${req.method} ${req.path}`);
  next();
});

// 4. Health check — BEFORE other routes
app.get("/", (req, res) => {
  res.json({ 
    status: "ok",
    message: "Server is running",
    time: new Date().toISOString(),
    env: process.env.NODE_ENV
  });
});

app.get("/api/health", (req, res) => {
  res.json({ 
    status: "ok",
    message: "Server is running"
  });
});

// 5. ALL ROUTES
app.use(storeRoutes);
app.use(csvRoutes);
app.use(invoiceRoutes);
app.use(logRoutes);
app.use(authRoutes);
app.use(adminRoutes);

// 6. Error handler — LAST
app.use((err, req, res, next) => {
  console.error("Server Error:", err.message);
  res.status(500).json({ 
    error: err.message 
  });
});

// 7. Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`
╔════════════════════════════════════╗
║  Server running on port ${PORT}       ║
║  Host: 0.0.0.0 (Railway Required)   ║
╠════════════════════════════════════╣
║  Routes available:                 ║
║  GET  /api/health                  ║
║  POST /api/store/add               ║
║  POST /api/invoice/send-bulk       ║
║  GET  /api/logs                    ║
╚════════════════════════════════════╝
  `);
});

module.exports = app;

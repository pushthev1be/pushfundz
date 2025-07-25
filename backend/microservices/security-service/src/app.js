const express = require('express');
const rateLimit = require('express-rate-limit');
const slowDown = require('express-slow-down');
const helmet = require('helmet');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const validator = require('validator');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

const app = express();
const PORT = process.env.PORT || 3007;

app.use(helmet());
app.use(express.json({ limit: '10mb' }));
app.use(require('cors')());

const dbPath = path.join(__dirname, '../../../../crypto-lending-backend/pushfundz.db');
const db = new sqlite3.Database(dbPath);

const JWT_SECRET = process.env.JWT_SECRET || 'pushfundz-security-key-2024';

const gameRateLimit = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 30, // 30 games per minute per IP
  message: { error: 'Too many game requests. Please wait before playing again.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const loanRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 loan requests per 15 minutes per IP
  message: { error: 'Too many loan requests. Please wait before requesting another loan.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const walletRateLimit = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 10, // 10 wallet operations per 5 minutes per IP
  message: { error: 'Too many wallet operations. Please wait before trying again.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const authRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // 10 auth attempts per 15 minutes per IP
  message: { error: 'Too many authentication attempts. Please wait before trying again.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const speedLimiter = slowDown({
  windowMs: 15 * 60 * 1000, // 15 minutes
  delayAfter: 50, // Allow 50 requests per 15 minutes at full speed
  delayMs: () => 500, // Add 500ms delay per request after delayAfter
  maxDelayMs: 20000, // Maximum delay of 20 seconds
  validate: { delayMs: false } // Disable warning
});

const validateInput = (req, res, next) => {
  const { body } = req;
  
  for (const key in body) {
    if (typeof body[key] === 'string') {
      body[key] = validator.escape(body[key]);
      
      if (body[key].includes('<script>') || body[key].includes('javascript:')) {
        return res.status(400).json({ error: 'Invalid input detected' });
      }
    }
  }
  
  if (body.email && !validator.isEmail(body.email)) {
    return res.status(400).json({ error: 'Invalid email format' });
  }
  
  if (body.amount && (!validator.isNumeric(body.amount.toString()) || body.amount < 0)) {
    return res.status(400).json({ error: 'Invalid amount' });
  }
  
  if (body.rp_stake && (!validator.isInt(body.rp_stake.toString()) || body.rp_stake < 0)) {
    return res.status(400).json({ error: 'Invalid RP stake amount' });
  }
  
  next();
};

const fraudDetection = async (req, res, next) => {
  try {
    const clientIP = req.ip || req.connection.remoteAddress;
    const userAgent = req.get('User-Agent') || '';
    const { user_id, amount } = req.body;
    
    const suspiciousPatterns = [
      { pattern: /bot|crawler|spider/i, field: 'userAgent', value: userAgent },
      { pattern: /^(10\.|192\.168\.|172\.(1[6-9]|2[0-9]|3[01])\.)/, field: 'ip', value: clientIP }
    ];
    
    let suspiciousScore = 0;
    
    const recentRequests = await getRecentRequests(clientIP);
    if (recentRequests > 100) { // More than 100 requests in last hour
      suspiciousScore += 50;
    }
    
    if (amount && amount > 1000) {
      suspiciousScore += 30;
    }
    
    if (suspiciousPatterns[0].pattern.test(userAgent)) {
      suspiciousScore += 40;
    }
    
    if (suspiciousScore > 50) {
      await logSuspiciousActivity(clientIP, userAgent, user_id, suspiciousScore, req.path);
      
      if (suspiciousScore > 80) {
        return res.status(429).json({ 
          error: 'Request blocked due to suspicious activity. Please contact support.' 
        });
      }
    }
    
    next();
  } catch (error) {
    console.error('Fraud detection error:', error);
    next(); // Continue on error to avoid blocking legitimate users
  }
};

const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  
  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }
  
  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Invalid or expired token' });
    }
    req.user = user;
    next();
  });
};

app.get('/security/rate-limits', gameRateLimit, (req, res) => {
  res.json({
    game: { windowMs: 60000, max: 30 },
    loan: { windowMs: 900000, max: 5 },
    wallet: { windowMs: 300000, max: 10 },
    auth: { windowMs: 900000, max: 10 }
  });
});

app.post('/security/validate-transaction', 
  walletRateLimit, 
  validateInput, 
  fraudDetection, 
  async (req, res) => {
    try {
      const { user_id, amount, transaction_type } = req.body;
      
      if (amount > 500) {
        const userHistory = await getUserTransactionHistory(user_id);
        if (userHistory.length < 3) {
          return res.status(400).json({ 
            error: 'High-value transactions require established account history' 
          });
        }
      }
      
      const recentDuplicate = await checkDuplicateTransaction(user_id, amount, transaction_type);
      if (recentDuplicate) {
        return res.status(400).json({ 
          error: 'Duplicate transaction detected. Please wait before retrying.' 
        });
      }
      
      res.json({ 
        valid: true, 
        message: 'Transaction validation passed',
        security_score: 'low_risk'
      });
    } catch (error) {
      console.error('Transaction validation error:', error);
      res.status(500).json({ error: 'Validation service error' });
    }
  }
);

app.post('/security/generate-token', authRateLimit, validateInput, async (req, res) => {
  try {
    const { user_id, email } = req.body;
    
    if (!user_id || !email) {
      return res.status(400).json({ error: 'User ID and email required' });
    }
    
    const token = jwt.sign(
      { user_id, email, issued_at: Date.now() },
      JWT_SECRET,
      { expiresIn: '24h' }
    );
    
    res.json({ token, expires_in: '24h' });
  } catch (error) {
    console.error('Token generation error:', error);
    res.status(500).json({ error: 'Token generation failed' });
  }
});

app.post('/security/audit-log', validateInput, async (req, res) => {
  try {
    const { user_id, action, details, ip_address } = req.body;
    
    await logAuditEvent(user_id, action, details, ip_address);
    
    res.json({ logged: true });
  } catch (error) {
    console.error('Audit logging error:', error);
    res.status(500).json({ error: 'Audit logging failed' });
  }
});

async function getRecentRequests(clientIP) {
  return new Promise((resolve, reject) => {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    db.get(
      `SELECT COUNT(*) as count FROM security_logs 
       WHERE ip_address = ? AND created_at > ?`,
      [clientIP, oneHourAgo],
      (err, row) => {
        if (err) reject(err);
        else resolve(row?.count || 0);
      }
    );
  });
}

async function logSuspiciousActivity(ip, userAgent, userId, score, path) {
  return new Promise((resolve, reject) => {
    db.run(
      `INSERT INTO security_logs (ip_address, user_agent, user_id, suspicious_score, request_path, created_at)
       VALUES (?, ?, ?, ?, ?, datetime('now'))`,
      [ip, userAgent, userId, score, path],
      function(err) {
        if (err) reject(err);
        else resolve(this.lastID);
      }
    );
  });
}

async function getUserTransactionHistory(userId) {
  return new Promise((resolve, reject) => {
    db.all(
      `SELECT * FROM transactions WHERE user_id = ? ORDER BY created_at DESC LIMIT 10`,
      [userId],
      (err, rows) => {
        if (err) reject(err);
        else resolve(rows || []);
      }
    );
  });
}

async function checkDuplicateTransaction(userId, amount, type) {
  return new Promise((resolve, reject) => {
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    db.get(
      `SELECT id FROM transactions 
       WHERE user_id = ? AND amount = ? AND transaction_type = ? AND created_at > ?`,
      [userId, amount, type, fiveMinutesAgo],
      (err, row) => {
        if (err) reject(err);
        else resolve(!!row);
      }
    );
  });
}

async function logAuditEvent(userId, action, details, ipAddress) {
  return new Promise((resolve, reject) => {
    db.run(
      `INSERT INTO audit_logs (user_id, action, details, ip_address, created_at)
       VALUES (?, ?, ?, ?, datetime('now'))`,
      [userId, action, JSON.stringify(details), ipAddress],
      function(err) {
        if (err) reject(err);
        else resolve(this.lastID);
      }
    );
  });
}

db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS security_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ip_address TEXT,
    user_agent TEXT,
    user_id TEXT,
    suspicious_score INTEGER,
    request_path TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
  
  db.run(`CREATE TABLE IF NOT EXISTS audit_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT,
    action TEXT,
    details TEXT,
    ip_address TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
});

app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    service: 'security-service',
    rateLimits: {
      game: '30/min',
      loan: '5/15min',
      wallet: '10/5min',
      auth: '10/15min'
    }
  });
});

app.use('/middleware/game-rate-limit', gameRateLimit);
app.use('/middleware/loan-rate-limit', loanRateLimit);
app.use('/middleware/wallet-rate-limit', walletRateLimit);
app.use('/middleware/auth-rate-limit', authRateLimit);
app.use('/middleware/validate-input', validateInput);
app.use('/middleware/fraud-detection', fraudDetection);
app.use('/middleware/authenticate', authenticateToken);

app.listen(PORT, () => {
  console.log(`Security Service running on port ${PORT}`);
});

module.exports = app;

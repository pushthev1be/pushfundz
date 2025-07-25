const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const jwt = require('jsonwebtoken');
const { createProxyMiddleware } = require('http-proxy-middleware');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(helmet());
app.use(cors());
app.use(express.json());

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // limit each IP to 100 requests per windowMs
});
app.use(limiter);

const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.sendStatus(401);
  }

  jwt.verify(token, process.env.JWT_SECRET || 'fallback-secret', (err, user) => {
    if (err) return res.sendStatus(403);
    req.user = user;
    next();
  });
};

app.use('/api/fiat', createProxyMiddleware({
  target: process.env.FIAT_RAILS_URL || 'http://localhost:3002',
  changeOrigin: true,
  pathRewrite: {
    '^/api/fiat': ''
  }
}));

app.use('/api/blockchain', createProxyMiddleware({
  target: process.env.BLOCKCHAIN_ADAPTER_URL || 'http://localhost:3003',
  changeOrigin: true,
  pathRewrite: {
    '^/api/blockchain': ''
  }
}));

app.use('/api/points', createProxyMiddleware({
  target: process.env.POINTS_ENGINE_URL || 'http://localhost:3004',
  changeOrigin: true,
  pathRewrite: {
    '^/api/points': ''
  }
}));

app.use('/api/notifications', createProxyMiddleware({
  target: process.env.NOTIFICATION_SERVICE_URL || 'http://localhost:3005',
  changeOrigin: true,
  pathRewrite: {
    '^/api/notifications': ''
  }
}));

app.use('/api/games', createProxyMiddleware({
  target: process.env.GAMES_SERVICE_URL || 'http://localhost:3006',
  changeOrigin: true,
  pathRewrite: {
    '^/api/games': ''
  }
}));

app.get('/health', (req, res) => {
  res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

app.post('/api/auth/login', async (req, res) => {
  const { walletAddress, signature } = req.body;
  
  try {
    const token = jwt.sign(
      { walletAddress, timestamp: Date.now() },
      process.env.JWT_SECRET || 'fallback-secret',
      { expiresIn: '24h' }
    );
    
    res.json({ token, walletAddress });
  } catch (error) {
    res.status(500).json({ error: 'Authentication failed' });
  }
});

app.listen(PORT, () => {
  console.log(`API Gateway running on port ${PORT}`);
});

module.exports = app;

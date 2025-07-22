const express = require('express');
const axios = require('axios');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3002;

app.use(express.json());

const RAMP_API_KEY = process.env.RAMP_API_KEY;
const RAMP_SECRET = process.env.RAMP_SECRET;
const RAMP_BASE_URL = 'https://api.ramp.network';

const generateRampSignature = (payload, secret) => {
  return crypto.createHmac('sha256', secret).update(payload).digest('hex');
};

app.post('/deposit/initiate', async (req, res) => {
  try {
    const { userId, amount, currency, walletAddress } = req.body;
    
    const payload = {
      type: 'ONRAMP',
      amount: amount,
      fiatCurrency: currency,
      cryptoCurrency: 'USDC',
      userAddress: walletAddress,
      webhookUrl: `${process.env.BASE_URL}/webhooks/ramp`,
      redirectUrl: `${process.env.FRONTEND_URL}/dashboard`
    };

    const response = await axios.post(`${RAMP_BASE_URL}/api/host-api/purchase`, payload, {
      headers: {
        'Authorization': `Bearer ${RAMP_API_KEY}`,
        'Content-Type': 'application/json'
      }
    });

    res.json({
      success: true,
      purchaseId: response.data.purchase.id,
      redirectUrl: response.data.purchase.actions.find(a => a.type === 'REDIRECT')?.url
    });
  } catch (error) {
    console.error('Ramp deposit error:', error.response?.data || error.message);
    res.status(500).json({ error: 'Failed to initiate deposit' });
  }
});

app.post('/withdraw/initiate', async (req, res) => {
  try {
    const { userId, amount, currency, bankAccount } = req.body;
    
    const payload = {
      type: 'OFFRAMP',
      amount: amount,
      cryptoCurrency: 'USDC',
      fiatCurrency: currency,
      bankAccount: bankAccount,
      webhookUrl: `${process.env.BASE_URL}/webhooks/ramp`
    };

    const response = await axios.post(`${RAMP_BASE_URL}/api/host-api/sale`, payload, {
      headers: {
        'Authorization': `Bearer ${RAMP_API_KEY}`,
        'Content-Type': 'application/json'
      }
    });

    res.json({
      success: true,
      saleId: response.data.sale.id,
      status: response.data.sale.status
    });
  } catch (error) {
    console.error('Ramp withdrawal error:', error.response?.data || error.message);
    res.status(500).json({ error: 'Failed to initiate withdrawal' });
  }
});

app.post('/webhooks/ramp', (req, res) => {
  try {
    const signature = req.headers['x-ramp-signature'];
    const payload = JSON.stringify(req.body);
    const expectedSignature = generateRampSignature(payload, RAMP_SECRET);
    
    if (signature !== expectedSignature) {
      return res.status(401).json({ error: 'Invalid signature' });
    }

    const { type, purchase, sale } = req.body;
    
    if (type === 'PURCHASE_COMPLETED' && purchase) {
      console.log('Purchase completed:', purchase.id);
    }
    
    if (type === 'SALE_COMPLETED' && sale) {
      console.log('Sale completed:', sale.id);
    }

    res.json({ received: true });
  } catch (error) {
    console.error('Webhook error:', error);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

app.get('/rates/:from/:to', async (req, res) => {
  try {
    const { from, to } = req.params;
    const { amount } = req.query;
    
    const response = await axios.get(`${RAMP_BASE_URL}/api/host-api/assets`, {
      headers: {
        'Authorization': `Bearer ${RAMP_API_KEY}`
      }
    });
    
    const rate = 1.0; // Placeholder
    
    res.json({
      from,
      to,
      rate,
      amount: parseFloat(amount),
      convertedAmount: parseFloat(amount) * rate,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Rate fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch rates' });
  }
});

app.get('/health', (req, res) => {
  res.json({ status: 'healthy', service: 'fiat-rails' });
});

app.listen(PORT, () => {
  console.log(`Fiat Rails Service running on port ${PORT}`);
});

module.exports = app;

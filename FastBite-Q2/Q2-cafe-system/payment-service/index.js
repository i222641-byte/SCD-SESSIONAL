// FastBite Payment Service (database: fastbite_payments).
// The payment provider is simulated: a payment is "successful" when the amount
// matches the order total.
const express = require('express');
const mongoose = require('mongoose');
const axios = require('axios');
const crypto = require('crypto');

// Configuration comes ONLY from environment variables (no hard-coded hosts or passwords).
function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    console.error(`Missing required environment variable ${name}. See .env.example`);
    process.exit(1);
  }
  return value;
}

const PORT = process.env.PORT || 3005;
const MONGO_URI = requireEnv('MONGO_URI');
const ORDER_SERVICE_URL = requireEnv('ORDER_SERVICE_URL');

const app = express();
app.use(express.json());

const paymentSchema = new mongoose.Schema({
  paymentId: { type: String, required: true, unique: true },
  orderId: { type: String, required: true },
  amount: { type: Number, required: true },
  method: { type: String, default: 'card' },
  status: { type: String, default: 'PAID' },
  createdAt: { type: Date, default: Date.now },
});
const Payment = mongoose.model('Payment', paymentSchema);

app.get('/health', (req, res) => {
  res.json({ service: 'payment-service', status: 'ok' });
});

// Pay for an order. Body: { "orderId": "ORD-1A2B3C4D", "amount": 650 }
app.post('/payments', async (req, res) => {
  const { orderId, amount, method } = req.body || {};
  if (!orderId || typeof amount !== 'number') {
    return res.status(400).json({ error: 'orderId and a numeric amount are required' });
  }

  // 1. ask the Order Service for the order
  let order;
  try {
    ({ data: order } = await axios.get(`${ORDER_SERVICE_URL}/orders/${encodeURIComponent(orderId)}`));
  } catch (err) {
    if (err.response && err.response.status === 404) {
      return res.status(404).json({ error: 'Order not found' });
    }
    return res.status(502).json({ error: 'Order Service is unavailable' });
  }

  // 2. verify the order can be paid and the amount matches
  if (order.status === 'PAID') return res.status(409).json({ error: 'Order is already paid' });
  if (order.status !== 'CONFIRMED') {
    return res.status(400).json({ error: `Order is ${order.status} and cannot be paid` });
  }
  if (amount !== order.total) {
    return res.status(400).json({
      error: 'Payment amount does not match the order total',
      orderTotal: order.total,
      received: amount,
    });
  }

  // 3. record the transaction
  const paymentId = 'PAY-' + crypto.randomBytes(4).toString('hex').toUpperCase();
  const payment = await Payment.create({ paymentId, orderId, amount, method });

  // 4. tell the Order Service the order is paid
  try {
    await axios.put(`${ORDER_SERVICE_URL}/orders/${encodeURIComponent(orderId)}/status`, { status: 'PAID' });
  } catch (err) {
    console.error('Could not mark order as paid:', err.message);
  }

  res.status(201).json({
    message: 'Payment successful',
    paymentId: payment.paymentId,
    orderId,
    amount,
    status: payment.status,
  });
});

app.get('/payments/:orderId', async (req, res) => {
  try {
    const payment = await Payment.findOne({ orderId: req.params.orderId }, '-_id -__v');
    if (!payment) return res.status(404).json({ error: 'No payment found for this order' });
    res.json(payment);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/payments', async (req, res) => {
  try {
    res.json(await Payment.find({}, '-_id -__v').sort({ createdAt: -1 }));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

mongoose
  .connect(MONGO_URI, { serverSelectionTimeoutMS: 5000 })
  .then(() => {
    console.log('Payment Service connected to MongoDB');
    app.listen(PORT, () => console.log(`Payment Service running on port ${PORT}`));
  })
  .catch((err) => {
    console.error('Payment Service could not connect to MongoDB:', err.message);
    process.exit(1);
  });

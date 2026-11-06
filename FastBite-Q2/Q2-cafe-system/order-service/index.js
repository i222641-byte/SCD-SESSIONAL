// FastBite Order Service - the coordinator (database: fastbite_orders).
// For every order it talks to the Menu, Customer and Inventory services.
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

const PORT = process.env.PORT || 3002;
const MONGO_URI = requireEnv('MONGO_URI');
const MENU_SERVICE_URL = requireEnv('MENU_SERVICE_URL');
const INVENTORY_SERVICE_URL = requireEnv('INVENTORY_SERVICE_URL');
const CUSTOMER_SERVICE_URL = requireEnv('CUSTOMER_SERVICE_URL');

const app = express();
app.use(express.json());

const orderSchema = new mongoose.Schema({
  orderId: { type: String, required: true, unique: true },
  customerId: { type: String, required: true },
  items: [
    {
      _id: false,
      itemId: String,
      name: String,
      price: Number,
      quantity: Number,
    },
  ],
  total: { type: Number, required: true },
  status: { type: String, default: 'PENDING' }, // PENDING -> CONFIRMED -> PAID
  createdAt: { type: Date, default: Date.now },
});
const Order = mongoose.model('Order', orderSchema);

app.get('/health', (req, res) => {
  res.json({ service: 'order-service', status: 'ok' });
});

// Place an order. Body: { "customerId": "C-1042", "items": [ { "itemId": "M-101", "quantity": 1 } ] }
app.post('/orders', async (req, res) => {
  const { customerId, items } = req.body || {};
  if (!customerId || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'customerId and a non-empty items array are required' });
  }

  // 1. check the customer with the Customer Service
  try {
    await axios.get(`${CUSTOMER_SERVICE_URL}/customers/${encodeURIComponent(customerId)}`);
  } catch (err) {
    if (err.response && err.response.status === 404) {
      return res.status(404).json({ error: 'Customer not found' });
    }
    return res.status(502).json({ error: 'Customer Service is unavailable' });
  }

  // 2. validate every item with the Menu Service and calculate the total
  const lines = [];
  let total = 0;
  for (const { itemId, quantity } of items) {
    if (!itemId || !Number.isInteger(quantity) || quantity <= 0) {
      return res.status(400).json({ error: 'Every item needs an itemId and a positive integer quantity' });
    }
    try {
      const { data: menuItem } = await axios.get(`${MENU_SERVICE_URL}/menu/${encodeURIComponent(itemId)}`);
      if (!menuItem.available) {
        return res.status(400).json({ error: `${menuItem.name} is not available` });
      }
      lines.push({ itemId, name: menuItem.name, price: menuItem.price, quantity });
      total += menuItem.price * quantity;
    } catch (err) {
      if (err.response && err.response.status === 404) {
        return res.status(400).json({ error: `Item ${itemId} is not on the menu` });
      }
      return res.status(502).json({ error: 'Menu Service is unavailable' });
    }
  }

  // 3. store the order
  const orderId = 'ORD-' + crypto.randomBytes(4).toString('hex').toUpperCase();
  await Order.create({ orderId, customerId, items: lines, total, status: 'PENDING' });

  // 4. reduce stock in the Inventory Service
  try {
    await axios.post(`${INVENTORY_SERVICE_URL}/inventory/update`, {
      items: lines.map((l) => ({ itemId: l.itemId, quantity: l.quantity })),
    });
  } catch (err) {
    await Order.deleteOne({ orderId }); // nothing was sold, so the order is discarded
    if (err.response && [404, 409].includes(err.response.status)) {
      return res.status(409).json({ error: 'Order rejected', reason: err.response.data });
    }
    return res.status(502).json({ error: 'Inventory Service is unavailable' });
  }

  // 5. award loyalty points: 1 point for every Rs. 10 spent
  const points = Math.floor(total / 10);
  let loyalty = null;
  try {
    const { data } = await axios.post(`${CUSTOMER_SERVICE_URL}/customers/update-points`, { customerId, points });
    loyalty = data;
  } catch (err) {
    console.error('Could not award loyalty points:', err.message);
  }

  await Order.updateOne({ orderId }, { status: 'CONFIRMED' });
  res.status(201).json({
    orderId,
    customerId,
    items: lines,
    total,
    status: 'CONFIRMED',
    pointsEarned: points,
    loyalty,
  });
});

// Used by the Payment Service to verify an order
app.get('/orders/:orderId', async (req, res) => {
  try {
    const order = await Order.findOne({ orderId: req.params.orderId }, '-_id -__v');
    if (!order) return res.status(404).json({ error: 'Order not found' });
    res.json(order);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/orders', async (req, res) => {
  try {
    res.json(await Order.find({}, '-_id -__v').sort({ createdAt: -1 }));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Used by the Payment Service to mark an order as paid. Body: { "status": "PAID" }
app.put('/orders/:orderId/status', async (req, res) => {
  const { status } = req.body || {};
  if (!['CONFIRMED', 'PAID'].includes(status)) {
    return res.status(400).json({ error: 'status must be CONFIRMED or PAID' });
  }
  try {
    const order = await Order.findOneAndUpdate({ orderId: req.params.orderId }, { status }, { new: true });
    if (!order) return res.status(404).json({ error: 'Order not found' });
    res.json({ orderId: order.orderId, status: order.status });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

mongoose
  .connect(MONGO_URI, { serverSelectionTimeoutMS: 5000 })
  .then(() => {
    console.log('Order Service connected to MongoDB');
    app.listen(PORT, () => console.log(`Order Service running on port ${PORT}`));
  })
  .catch((err) => {
    console.error('Order Service could not connect to MongoDB:', err.message);
    process.exit(1);
  });

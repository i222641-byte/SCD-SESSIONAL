// FastBite Customer Service
// Owns customer profiles and loyalty points (database: fastbite_customers).
const express = require('express');
const mongoose = require('mongoose');

// Configuration comes ONLY from environment variables (no hard-coded hosts or passwords).
function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    console.error(`Missing required environment variable ${name}. See .env.example`);
    process.exit(1);
  }
  return value;
}

const PORT = process.env.PORT || 3004;
const MONGO_URI = requireEnv('MONGO_URI');
const FREE_DRINK_POINTS = 200; // a free drink is unlocked at this balance

const app = express();
app.use(express.json());

const customerSchema = new mongoose.Schema({
  customerId: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  email: { type: String, required: true },
  loyaltyPoints: { type: Number, default: 0, min: 0 },
});
const Customer = mongoose.model('Customer', customerSchema);

const view = (c) => ({
  customerId: c.customerId,
  name: c.name,
  email: c.email,
  loyaltyPoints: c.loyaltyPoints,
  freeDrinkUnlocked: c.loyaltyPoints >= FREE_DRINK_POINTS,
});

app.get('/health', (req, res) => {
  res.json({ service: 'customer-service', status: 'ok' });
});

// Register a customer
app.post('/customers', async (req, res) => {
  try {
    res.status(201).json(view(await Customer.create(req.body)));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Add loyalty points. Body: { "customerId": "C-1042", "points": 65 }
app.post('/customers/update-points', async (req, res) => {
  const { customerId, points } = req.body || {};
  if (!customerId || !Number.isInteger(points) || points <= 0) {
    return res.status(400).json({ error: 'customerId and a positive integer points are required' });
  }
  try {
    const customer = await Customer.findOneAndUpdate(
      { customerId },
      { $inc: { loyaltyPoints: points } },
      { new: true }
    );
    if (!customer) return res.status(404).json({ error: 'Customer not found' });
    res.json(view(customer));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get a customer's profile and current points
app.get('/customers/:customerId', async (req, res) => {
  try {
    const customer = await Customer.findOne({ customerId: req.params.customerId });
    if (!customer) return res.status(404).json({ error: 'Customer not found' });
    res.json(view(customer));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

async function seed() {
  if (process.env.SEED_DATA === 'false') return;
  if ((await Customer.countDocuments()) > 0) return;
  await Customer.insertMany([
    { customerId: 'C-1042', name: 'Hamza Ali', email: 'hamza.ali@example.com', loyaltyPoints: 150 },
    { customerId: 'C-1043', name: 'Ayesha Khan', email: 'ayesha.khan@example.com', loyaltyPoints: 20 },
  ]);
  console.log('Customers seeded with demo data');
}

mongoose
  .connect(MONGO_URI, { serverSelectionTimeoutMS: 5000 })
  .then(async () => {
    console.log('Customer Service connected to MongoDB');
    await seed();
    app.listen(PORT, () => console.log(`Customer Service running on port ${PORT}`));
  })
  .catch((err) => {
    console.error('Customer Service could not connect to MongoDB:', err.message);
    process.exit(1);
  });

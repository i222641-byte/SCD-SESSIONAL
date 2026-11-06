// FastBite Menu Service
// Owns the menu (database: fastbite_menu).
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

const PORT = process.env.PORT || 3001;
const MONGO_URI = requireEnv('MONGO_URI');

const app = express();
app.use(express.json());

const menuItemSchema = new mongoose.Schema({
  itemId: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  price: { type: Number, required: true, min: 0 },
  category: { type: String, default: 'General' },
  available: { type: Boolean, default: true },
});
const MenuItem = mongoose.model('MenuItem', menuItemSchema);

app.get('/health', (req, res) => {
  res.json({ service: 'menu-service', status: 'ok' });
});

// All items that are currently available
app.get('/menu', async (req, res) => {
  try {
    const items = await MenuItem.find({ available: true }, '-_id -__v').sort({ itemId: 1 });
    res.json(items);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// One item (used by the Order Service to validate an order)
app.get('/menu/:itemId', async (req, res) => {
  try {
    const item = await MenuItem.findOne({ itemId: req.params.itemId }, '-_id -__v');
    if (!item) return res.status(404).json({ error: 'Item not found' });
    res.json(item);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Add a new menu item
app.post('/menu', async (req, res) => {
  try {
    const item = await MenuItem.create(req.body);
    res.status(201).json(item);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

async function seed() {
  if (process.env.SEED_DATA === 'false') return;
  if ((await MenuItem.countDocuments()) > 0) return;
  await MenuItem.insertMany([
    { itemId: 'M-101', name: 'Zinger Burger', price: 450, category: 'Burgers' },
    { itemId: 'M-102', name: 'Fries', price: 200, category: 'Sides' },
    { itemId: 'M-103', name: 'Cold Drink', price: 100, category: 'Drinks' },
    { itemId: 'M-104', name: 'Chai', price: 80, category: 'Drinks' },
  ]);
  console.log('Menu seeded with demo data');
}

mongoose
  .connect(MONGO_URI, { serverSelectionTimeoutMS: 5000 })
  .then(async () => {
    console.log('Menu Service connected to MongoDB');
    await seed();
    app.listen(PORT, () => console.log(`Menu Service running on port ${PORT}`));
  })
  .catch((err) => {
    console.error('Menu Service could not connect to MongoDB:', err.message);
    process.exit(1);
  });

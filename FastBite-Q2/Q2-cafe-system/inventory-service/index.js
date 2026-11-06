// FastBite Inventory Service
// Owns the stock levels (database: fastbite_inventory).
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

const PORT = process.env.PORT || 3003;
const MONGO_URI = requireEnv('MONGO_URI');

const app = express();
app.use(express.json());

const stockSchema = new mongoose.Schema({
  itemId: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  quantity: { type: Number, required: true, min: 0 },
});
const Stock = mongoose.model('Stock', stockSchema);

app.get('/health', (req, res) => {
  res.json({ service: 'inventory-service', status: 'ok' });
});

app.get('/inventory', async (req, res) => {
  try {
    res.json(await Stock.find({}, '-_id -__v').sort({ itemId: 1 }));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/inventory/:itemId', async (req, res) => {
  try {
    const stock = await Stock.findOne({ itemId: req.params.itemId }, '-_id -__v');
    if (!stock) return res.status(404).json({ error: 'Item not found in inventory' });
    res.json(stock);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Add a new stock record
app.post('/inventory', async (req, res) => {
  try {
    res.status(201).json(await Stock.create(req.body));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Reduce stock for an order. Body: { "items": [ { "itemId": "M-101", "quantity": 1 } ] }
// Either every item is reduced, or nothing is changed (overselling is refused).
app.post('/inventory/update', async (req, res) => {
  const items = req.body && req.body.items;
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'items array is required' });
  }
  try {
    // 1. verify that every item exists and has enough stock
    for (const { itemId, quantity } of items) {
      if (!Number.isInteger(quantity) || quantity <= 0) {
        return res.status(400).json({ error: `Invalid quantity for ${itemId}` });
      }
      const stock = await Stock.findOne({ itemId });
      if (!stock) return res.status(404).json({ error: `Item ${itemId} not found in inventory` });
      if (stock.quantity < quantity) {
        return res.status(409).json({
          error: `Insufficient stock for ${stock.name}`,
          itemId,
          available: stock.quantity,
          requested: quantity,
        });
      }
    }
    // 2. reduce the quantities (undo everything if one update fails)
    const done = [];
    for (const { itemId, quantity } of items) {
      const result = await Stock.updateOne(
        { itemId, quantity: { $gte: quantity } },
        { $inc: { quantity: -quantity } }
      );
      if (result.modifiedCount !== 1) {
        for (const d of done) await Stock.updateOne({ itemId: d.itemId }, { $inc: { quantity: d.quantity } });
        return res.status(409).json({ error: `Insufficient stock for ${itemId}` });
      }
      done.push({ itemId, quantity });
    }
    const updated = await Stock.find({ itemId: { $in: items.map((i) => i.itemId) } }, '-_id -__v');
    res.json({ message: 'Stock updated', items: updated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

async function seed() {
  if (process.env.SEED_DATA === 'false') return;
  if ((await Stock.countDocuments()) > 0) return;
  await Stock.insertMany([
    { itemId: 'M-101', name: 'Zinger Burger', quantity: 80 },
    { itemId: 'M-102', name: 'Fries', quantity: 120 },
    { itemId: 'M-103', name: 'Cold Drink', quantity: 200 },
    { itemId: 'M-104', name: 'Chai', quantity: 150 },
  ]);
  console.log('Inventory seeded with demo data');
}

mongoose
  .connect(MONGO_URI, { serverSelectionTimeoutMS: 5000 })
  .then(async () => {
    console.log('Inventory Service connected to MongoDB');
    await seed();
    app.listen(PORT, () => console.log(`Inventory Service running on port ${PORT}`));
  })
  .catch((err) => {
    console.error('Inventory Service could not connect to MongoDB:', err.message);
    process.exit(1);
  });

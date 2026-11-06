// FastBite API Gateway
// Single entry point for the mobile app. It contains no business logic and no
// database: it only forwards each request to the service that owns that route.
const express = require('express');
const proxy = require('express-http-proxy');

// Configuration comes ONLY from environment variables (no hard-coded hosts or passwords).
function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    console.error(`Missing required environment variable ${name}. See .env.example`);
    process.exit(1);
  }
  return value;
}

const PORT = process.env.PORT || 3000;

// Addresses of the services behind the gateway.
const MENU_SERVICE_URL = requireEnv('MENU_SERVICE_URL');
const ORDER_SERVICE_URL = requireEnv('ORDER_SERVICE_URL');
const INVENTORY_SERVICE_URL = requireEnv('INVENTORY_SERVICE_URL');
const CUSTOMER_SERVICE_URL = requireEnv('CUSTOMER_SERVICE_URL');
const PAYMENT_SERVICE_URL = requireEnv('PAYMENT_SERVICE_URL');

const app = express();

app.get('/health', (req, res) => {
  res.json({ service: 'api-gateway', status: 'ok' });
});

const routes = {
  '/menu': MENU_SERVICE_URL,
  '/orders': ORDER_SERVICE_URL,
  '/inventory': INVENTORY_SERVICE_URL,
  '/customers': CUSTOMER_SERVICE_URL,
  '/payments': PAYMENT_SERVICE_URL,
};

for (const [prefix, target] of Object.entries(routes)) {
  app.use(
    prefix,
    proxy(target, {
      // forward the full original path (e.g. /menu/M-101) to the target service
      proxyReqPathResolver: (req) => req.originalUrl,
      proxyErrorHandler: (err, res) => {
        console.error(`Gateway error for ${prefix}: ${err.message}`);
        res.status(502).json({ error: `Service for ${prefix} is unavailable` });
      },
    })
  );
}

app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

app.listen(PORT, () => {
  console.log(`API Gateway running on port ${PORT}`);
});

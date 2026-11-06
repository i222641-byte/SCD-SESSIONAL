// PM2 process file - starts all six FastBite services with ONE command:
//     pm2 start ecosystem.config.js
// Values (passwords, hostnames) are read from .env, which is NOT in git.
const fs = require('fs');
const path = require('path');

function loadEnv(file) {
  if (!fs.existsSync(file)) {
    throw new Error(`.env not found at ${file}. Copy .env.example to .env and fill it in.`);
  }
  const env = {};
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  return env;
}

const e = loadEnv(path.join(__dirname, '.env'));
fs.mkdirSync(path.join(__dirname, 'logs'), { recursive: true });
const mongo = (db) =>
  `mongodb://${encodeURIComponent(e.MONGO_USER)}:${encodeURIComponent(e.MONGO_PASSWORD)}` +
  `@${e.MONGO_HOST}/${db}?authSource=${e.MONGO_AUTH_SOURCE || 'admin'}`;

const common = {
  script: 'index.js',
  exec_mode: 'fork',
  instances: 1,
  autorestart: true,        // restart automatically if a service crashes
  restart_delay: 3000,      // e.g. waiting for MongoDB to come up
  max_restarts: 50,
  max_memory_restart: '250M',
  time: true,               // timestamps in logs
  merge_logs: true,         // one log file per service (no -id suffix)
};

const service = (name, port, extraEnv = {}) => ({
  ...common,
  name,
  cwd: path.join(__dirname, name),
  out_file: path.join(__dirname, 'logs', `${name}.out.log`),
  error_file: path.join(__dirname, 'logs', `${name}.err.log`),
  env: { NODE_ENV: 'production', PORT: port, ...extraEnv },
});

module.exports = {
  apps: [
    service('api-gateway', 3000, {
      MENU_SERVICE_URL: e.MENU_SERVICE_URL,
      ORDER_SERVICE_URL: e.ORDER_SERVICE_URL,
      INVENTORY_SERVICE_URL: e.INVENTORY_SERVICE_URL,
      CUSTOMER_SERVICE_URL: e.CUSTOMER_SERVICE_URL,
      PAYMENT_SERVICE_URL: e.PAYMENT_SERVICE_URL,
    }),
    service('menu-service', 3001, { MONGO_URI: mongo('fastbite_menu'), SEED_DATA: e.SEED_DATA }),
    service('order-service', 3002, {
      MONGO_URI: mongo('fastbite_orders'),
      MENU_SERVICE_URL: e.MENU_SERVICE_URL,
      INVENTORY_SERVICE_URL: e.INVENTORY_SERVICE_URL,
      CUSTOMER_SERVICE_URL: e.CUSTOMER_SERVICE_URL,
    }),
    service('inventory-service', 3003, { MONGO_URI: mongo('fastbite_inventory'), SEED_DATA: e.SEED_DATA }),
    service('customer-service', 3004, { MONGO_URI: mongo('fastbite_customers'), SEED_DATA: e.SEED_DATA }),
    service('payment-service', 3005, {
      MONGO_URI: mongo('fastbite_payments'),
      ORDER_SERVICE_URL: e.ORDER_SERVICE_URL,
    }),
  ],
};

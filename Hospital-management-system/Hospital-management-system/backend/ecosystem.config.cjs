// PM2 process definition for the Hospital Appointment API.
// .cjs extension is required because package.json has "type": "module".
module.exports = {
  apps: [
    {
      name: "22i-2641",            // process name required by the task
      script: "server.js",
      cwd: __dirname,
      instances: 1,
      exec_mode: "fork",
      autorestart: true,           // restart if the process crashes / exits
      max_restarts: 50,
      restart_delay: 2000,         // wait 2s between restarts
      watch: false,
      max_memory_restart: "300M",
      env: {
        NODE_ENV: "production",
        PORT: 4001                 // internal only — bound to 127.0.0.1 in server.js
      }
    }
  ]
};

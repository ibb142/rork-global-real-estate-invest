const path = require('node:path');

const configuredRoot = typeof process.env.CHAT_APP_ROOT === 'string' ? process.env.CHAT_APP_ROOT.trim() : '';
const projectRoot = configuredRoot ? path.resolve(configuredRoot) : path.resolve(__dirname, '../../..');
const logsRoot = path.join(projectRoot, 'logs');
const dataRoot = path.join(projectRoot, 'data');
const port = process.env.CHAT_API_PORT || process.env.PORT || '3000';

module.exports = {
  apps: [
    {
      name: 'ivx-chat-api',
      cwd: projectRoot,
      script: 'node',
      args: '--import tsx backend/express-chat-server.ts',
      interpreter: 'none',
      exec_mode: 'fork',
      instances: 1,
      autorestart: true,
      restart_delay: 5000,
      max_restarts: 10,
      exp_backoff_restart_delay: 100,
      max_memory_restart: '300M',
      time: true,
      out_file: path.join(logsRoot, 'ivx-chat-api.out.log'),
      error_file: path.join(logsRoot, 'ivx-chat-api.error.log'),
      env: {
        NODE_ENV: 'production',
        HOST: process.env.HOST || '0.0.0.0',
        PORT: port,
        CHAT_API_PORT: port,
        CHAT_FRONTEND_URL: process.env.CHAT_FRONTEND_URL || 'https://chat.ivxholding.com',
        CHAT_API_URL: process.env.CHAT_API_URL || 'https://api.ivxholding.com',
        CHAT_ALLOWED_ORIGINS: process.env.CHAT_ALLOWED_ORIGINS || 'https://chat.ivxholding.com,http://localhost:8081,http://localhost:19006,http://localhost:3000',
        CHAT_DATABASE_PATH: process.env.CHAT_DATABASE_PATH || path.join(dataRoot, 'chat-room.sqlite'),
      },
    },
  ],
};

const appRoot = process.env.CHAT_APP_ROOT || '/var/www/ivx-chat/current';

module.exports = {
  apps: [
    {
      name: 'ivx-chat-api',
      cwd: appRoot,
      script: 'node',
      args: '--import tsx backend/express-chat-server.ts',
      interpreter: 'none',
      exec_mode: 'fork',
      instances: 1,
      autorestart: true,
      max_restarts: 10,
      exp_backoff_restart_delay: 100,
      time: true,
      env: {
        NODE_ENV: process.env.NODE_ENV || 'production',
        HOST: process.env.HOST || '0.0.0.0',
        PORT: process.env.PORT || '3000',
      },
    },
  ],
};

module.exports = {
  apps: [
    {
      name: 'herb-api',
      cwd: '/www/wwwroot/Herb-recognition-api',
      script: 'dist/main.js',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '512M',
      env: {
        NODE_ENV: 'production',
        TRAIN_LOW_MEMORY: 'true',
        TRAIN_NUM_WORKERS: '0',
      },
    },
  ],
};

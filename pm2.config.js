module.exports = {
  apps: [
    {
      name: 'officebuzz-backend',
      script: 'server.js',
      cwd: './OB-backend',
      env: {
        NODE_ENV: 'production',
      },
      watch: false,
      restart_delay: 3000,
      max_restarts: 10,
      autorestart: true,
    },
  ],
};

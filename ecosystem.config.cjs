module.exports = {
  apps: [
    {
      name: "fnr-web",
      script: "node_modules/.bin/tsx",
      args: "server.ts",
      instances: 1,
      exec_mode: "fork",
      env: {
        NODE_ENV: "production",
        PORT: 3000,
        CORS_ORIGINS: "https://fina.nexar.site",
      },
      max_memory_restart: "500M",
      log_date_format: "YYYY-MM-DD HH:mm:ss",
      error_file: "/var/log/fnr/error.log",
      out_file: "/var/log/fnr/out.log",
      merge_logs: true,
    },
  ],
};

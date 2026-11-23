/**
 * SIMRS Rawat Jalan
 *
 * @author  Mochamad Mutaqin Kurniawan <mochmutaqin@gmail.com>
 * @link    https://github.com/mochmutaqin/simrs-rawat-jalan
 */

'use strict';
// Semua konfigurasi dari environment variable (lihat .env.example).
const env = process.env;

module.exports = {
  port: Number(env.PORT || 3001),
  host: env.HOST || undefined,           // kosong = semua interface (development)
  jwtSecret: env.JWT_SECRET || 'dev-secret-ganti-di-produksi',
  serviceToken: env.SERVICE_TOKEN || 'dev-service-token',
  corsOrigins: (env.CORS_ORIGINS || 'http://localhost:5173,http://localhost:4173').split(',').map((s) => s.trim()).filter(Boolean),
  db: {
    host: env.DB_HOST || 'localhost',
    port: Number(env.DB_PORT || 5432),
    database: env.DB_NAME || 'simrs',
    user: env.DB_USER || 'app_readonly',      // Node hanya boleh SELECT
    password: env.DB_PASSWORD || 'readonly',
    max: Number(env.DB_POOL_MAX || 10),
    statement_timeout: Number(env.DB_STATEMENT_TIMEOUT_MS || 5000),
    // tanggal (paid_at::date dsb.) mengikuti jam rumah sakit, sama dengan Yii
    options: `-c TimeZone=${env.APP_TIMEZONE || 'Asia/Jakarta'}`,
  },
  yii: {
    baseUrl: env.YII_BASE_URL || 'http://localhost:8080',
    serviceToken: env.YII_SERVICE_TOKEN || env.SERVICE_TOKEN || 'dev-service-token',
    timeoutMs: Number(env.YII_TIMEOUT_MS || 3000),
    retries: Number(env.YII_RETRIES || 2),
    retryBaseMs: Number(env.YII_RETRY_BASE_MS || 200),
  },
};

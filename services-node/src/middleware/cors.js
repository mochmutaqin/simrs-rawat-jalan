/**
 * SIMRS Rawat Jalan
 *
 * @author  Mochamad Mutaqin Kurniawan <mochmutaqin@gmail.com>
 * @link    https://github.com/mochmutaqin/simrs-rawat-jalan
 */

'use strict';
const config = require('../config');

// CORS sederhana tanpa dependency: hanya origin yang terdaftar (CORS_ORIGINS) yang diizinkan.
// Saat development, frontend Vite memakai proxy sehingga CORS tidak diperlukan;
// middleware ini untuk build produksi yang memanggil Node langsung dari origin lain.
function cors(req, res, next) {
  const origin = req.headers.origin;
  if (origin && config.corsOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, Idempotency-Key, X-Service-Token');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Max-Age', '86400');
    res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition, X-Total-Rows, X-Truncated');
  }
  if (req.method === 'OPTIONS') return res.status(204).end();
  next();
}

module.exports = { cors };

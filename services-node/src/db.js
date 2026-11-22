'use strict';
const { Pool, types } = require('pg');
const config = require('./config');

// bigint (OID 20) dikembalikan pg sebagai string secara default. Semua id di skema ini jauh di bawah
// Number.MAX_SAFE_INTEGER, jadi diparse ke number agar konsisten dengan response Yii.
types.setTypeParser(20, (v) => (v === null ? null : Number.parseInt(v, 10)));

const pool = new Pool(config.db);
pool.on('error', (err) => console.error('[db] idle client error:', err.message));

module.exports = {
  query: (text, params) => pool.query(text, params),
  close: () => pool.end(),
};

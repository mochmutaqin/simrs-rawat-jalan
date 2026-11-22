'use strict';
const { Pool } = require('pg');
const config = require('./config');

const pool = new Pool(config.db);
pool.on('error', (err) => console.error('[db] idle client error:', err.message));

module.exports = {
  query: (text, params) => pool.query(text, params),
  close: () => pool.end(),
};

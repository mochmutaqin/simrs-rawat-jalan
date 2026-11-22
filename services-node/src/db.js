/**
 * SIMRS Rawat Jalan
 *
 * @author  Mochamad Mutaqin Kurniawan <mochmutaqin@gmail.com>
 * @link    https://github.com/mochmutaqin/simrs-rawat-jalan
 */

'use strict';
const { Pool, types } = require('pg');
const config = require('./config');

// bigint (OID 20) dikembalikan pg sebagai string secara default. Semua id di skema ini jauh di bawah
// Number.MAX_SAFE_INTEGER, jadi diparse ke number agar konsisten dengan response Yii.
types.setTypeParser(20, (v) => (v === null ? null : Number.parseInt(v, 10)));
// date (OID 1082) dibiarkan sebagai string 'YYYY-MM-DD'. Default pg mengubahnya jadi Date jam 00:00 waktu lokal,
// yang di WIB (UTC+7) terserialisasi ke JSON sebagai tanggal sehari sebelumnya.
types.setTypeParser(1082, (v) => v);

const pool = new Pool(config.db);
pool.on('error', (err) => console.error('[db] idle client error:', err.message));

module.exports = {
  query: (text, params) => pool.query(text, params),
  close: () => pool.end(),
};

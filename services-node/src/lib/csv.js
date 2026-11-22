/**
 * SIMRS Rawat Jalan
 *
 * @author  Mochamad Mutaqin Kurniawan <mochmutaqin@gmail.com>
 * @link    https://github.com/mochmutaqin/simrs-rawat-jalan
 */

'use strict';
// Ekspor CSV untuk Excel berbahasa Indonesia: pemisah titik koma (;) dan BOM UTF-8,
// sehingga kolom langsung terpisah dan huruf non-ASCII tampil benar saat file dibuka.
const CSV_MAX_ROWS = 10000;
const SEP = ';';

const cell = (v) => {
  if (v === null || v === undefined) return '';
  const s = v instanceof Date ? v.toISOString() : String(v);
  return /[";\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** columns: [[key, header, format?], ...]; rows: hasil query. */
function toCsv(columns, rows) {
  const lines = [columns.map(([, h]) => cell(h)).join(SEP)];
  for (const row of rows) {
    lines.push(columns.map(([k, , fmt]) => cell(fmt ? fmt(row[k], row) : row[k])).join(SEP));
  }
  return `﻿${lines.join('\r\n')}\r\n`;
}

function sendCsv(res, filename, columns, rows) {
  const truncated = rows.length > CSV_MAX_ROWS;
  res.set({
    'Content-Type': 'text/csv; charset=utf-8',
    'Content-Disposition': `attachment; filename="${filename}"`,
    'X-Total-Rows': String(truncated ? CSV_MAX_ROWS : rows.length),
    ...(truncated ? { 'X-Truncated': 'true' } : {}),
  });
  res.send(toCsv(columns, truncated ? rows.slice(0, CSV_MAX_ROWS) : rows));
}

module.exports = { toCsv, sendCsv, CSV_MAX_ROWS };

/**
 * SIMRS Rawat Jalan
 *
 * @author  Mochamad Mutaqin Kurniawan <mochmutaqin@gmail.com>
 * @link    https://github.com/mochmutaqin/simrs-rawat-jalan
 */

'use strict';
// Format response konsisten:
//   sukses: { success: true,  data, meta? }
//   gagal : { success: false, error: { code, message, details? } }
const ok = (res, data, meta, status = 200) => {
  const body = { success: true, data };
  if (meta) body.meta = meta;
  return res.status(status).json(body);
};

const fail = (res, status, code, message, details) => {
  const error = { code, message };
  if (details !== undefined) error.details = details;
  return res.status(status).json({ success: false, error });
};

module.exports = { ok, fail };

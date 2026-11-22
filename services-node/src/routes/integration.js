/**
 * SIMRS Rawat Jalan
 *
 * @author  Mochamad Mutaqin Kurniawan <mochmutaqin@gmail.com>
 * @link    https://github.com/mochmutaqin/simrs-rawat-jalan
 */

'use strict';
const express = require('express');
const { z } = require('../lib/schemas');
const { validate } = require('../middleware/validate');
const { serviceAuth } = require('../middleware/auth');
const { ok } = require('../lib/response');

const r = express.Router();

// Konsumer event outbox dari Yii (at-least-once -> harus idempoten).
// Catatan jujur: Node hanya punya akses SELECT, jadi daftar event yang sudah
// diproses disimpan in-memory (dibatasi). Efek event ini sendiri idempoten
// (hanya log/notifikasi), sehingga restart service tidak menyebabkan data ganda.
const seen = new Map();
const MAX_SEEN = 10000;

const eventBody = z.object({
  id: z.union([z.string(), z.number()]).transform(String),
  type: z.enum(['lab.requested', 'payment.completed']),
  payload: z.record(z.string(), z.any()).default({}),
});

r.post('/events', serviceAuth, validate({ body: eventBody }), (req, res) => {
  const ev = req.valid.body;
  const duplicate = seen.has(ev.id);
  if (!duplicate) {
    seen.set(ev.id, Date.now());
    if (seen.size > MAX_SEEN) seen.delete(seen.keys().next().value);
    console.log(`[event] ${ev.type} id=${ev.id}`);
  }
  // 202 untuk keduanya: bagi pengirim, duplikat = sudah sukses (aman hapus dari outbox).
  ok(res, { accepted: true, duplicate }, undefined, 202);
});

module.exports = r;

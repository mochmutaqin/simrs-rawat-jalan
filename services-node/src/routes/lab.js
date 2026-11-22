'use strict';
const crypto = require('crypto');
const express = require('express');
const db = require('../db');
const { z, day, paging, id } = require('../lib/schemas');
const { validate } = require('../middleware/validate');
const { requirePermission } = require('../middleware/auth');
const { ok } = require('../lib/response');
const { notFound } = require('../lib/errors');
const { callYii } = require('../lib/yiiClient');

const r = express.Router();
const wrap = (fn) => (req, res, next) => fn(req, res).catch(next);

// ---- Daftar permintaan lab (untuk petugas lab) ---------------------------
const listQuery = z.object({
  status: z.enum(['requested', 'in_progress', 'completed', 'cancelled']).optional(),
  from: day.optional(),
  to: day.optional(),
  ...paging,
});

r.get('/requests', requirePermission('lab.view'), validate({ query: listQuery }), wrap(async (req, res) => {
  const { status, from, to, page, limit } = req.valid.query;
  const where = []; const p = [];
  if (status) { p.push(status); where.push(`lr.status = $${p.length}`); }
  if (from)   { p.push(from);   where.push(`lr.created_at >= $${p.length}::date`); }
  if (to)     { p.push(to);     where.push(`lr.created_at <  ($${p.length}::date + 1)`); }
  const w = where.length ? 'WHERE ' + where.join(' AND ') : '';

  const total = (await db.query(`SELECT count(*)::int AS n FROM lab_requests lr ${w}`, p)).rows[0].n;
  p.push(limit, (page - 1) * limit);
  const rows = (await db.query(
    `SELECT lr.id, lr.status, lr.created_at, lr.visit_id,
            pt.medical_record_no, pt.name AS patient_name,
            ms.name AS requested_by, po.name AS poli,
            count(li.id) FILTER (WHERE li.voided_at IS NULL)::int AS item_count,
            count(li.id) FILTER (WHERE li.voided_at IS NULL AND li.resulted_at IS NOT NULL)::int AS resulted_count
       FROM lab_requests lr
       JOIN visits v          ON v.id = lr.visit_id
       JOIN patients pt       ON pt.id = v.patient_id
       JOIN polis po          ON po.id = v.poli_id
       JOIN medical_staff ms  ON ms.id = lr.requested_by
       LEFT JOIN lab_request_items li ON li.lab_request_id = lr.id
       ${w}
      GROUP BY lr.id, pt.medical_record_no, pt.name, ms.name, po.name
      ORDER BY lr.created_at DESC, lr.id DESC
      LIMIT $${p.length - 1} OFFSET $${p.length}`, p)).rows;

  ok(res, rows, { page, limit, total, total_pages: Math.ceil(total / limit) });
}));

// ---- Detail satu permintaan ----------------------------------------------
async function loadRequest(requestId) {
  const head = (await db.query(
    `SELECT lr.id, lr.status, lr.notes, lr.created_at, lr.visit_id,
            pt.medical_record_no, pt.name AS patient_name, ms.name AS requested_by
       FROM lab_requests lr
       JOIN visits v ON v.id = lr.visit_id
       JOIN patients pt ON pt.id = v.patient_id
       JOIN medical_staff ms ON ms.id = lr.requested_by
      WHERE lr.id = $1`, [requestId])).rows[0];
  if (!head) return null;
  head.items = (await db.query(
    `SELECT li.id, lt.code, lt.name, lt.unit AS default_unit, lt.ref_range AS default_ref_range,
            li.result_value, li.result_unit, li.ref_range, li.result_flag, li.result_notes, li.resulted_at
       FROM lab_request_items li JOIN lab_tests lt ON lt.id = li.lab_test_id
      WHERE li.lab_request_id = $1 AND li.voided_at IS NULL
      ORDER BY li.id`, [requestId])).rows;
  return head;
}

r.get('/requests/:id', requirePermission('lab.view'), validate({ params: id }), wrap(async (req, res) => {
  const data = await loadRequest(req.valid.params.id);
  if (!data) throw notFound('Permintaan lab tidak ditemukan');
  ok(res, data);
}));

// ---- Hasil lab per kunjungan (dibaca dokter dari riwayat) ----------------
r.get('/visits/:id/results', requirePermission('lab.view'), validate({ params: id }), wrap(async (req, res) => {
  const rows = (await db.query(
    `SELECT lr.id AS request_id, lr.status, lt.code, lt.name,
            li.result_value, li.result_unit, li.ref_range, li.result_flag, li.resulted_at
       FROM lab_requests lr
       JOIN lab_request_items li ON li.lab_request_id = lr.id AND li.voided_at IS NULL
       JOIN lab_tests lt ON lt.id = li.lab_test_id
      WHERE lr.visit_id = $1 AND lr.status <> 'cancelled'
      ORDER BY lr.id, li.id`, [req.valid.params.id])).rows;
  ok(res, rows);
}));

// ---- Input hasil: Node validasi -> teruskan ke Yii (satu pintu tulis) ----
const resultBody = z.object({
  result_value: z.string().trim().min(1).max(200),
  result_unit: z.string().trim().max(50).optional(),
  result_flag: z.enum(['normal', 'high', 'low', 'abnormal']).optional(),
  result_notes: z.string().trim().max(1000).optional(),
}).strict();

r.post('/items/:id/result', requirePermission('lab.result'),
  validate({ params: id, body: resultBody }), wrap(async (req, res) => {
    const itemId = req.valid.params.id;
    const exists = (await db.query(
      `SELECT li.id, lr.status FROM lab_request_items li
         JOIN lab_requests lr ON lr.id = li.lab_request_id
        WHERE li.id = $1 AND li.voided_at IS NULL`, [itemId])).rows[0];
    if (!exists) throw notFound('Item pemeriksaan lab tidak ditemukan');

    // Kunci idempotensi: dari klien bila ada, kalau tidak dibuat sekali di sini
    // sehingga semua retry internal memakai kunci yang sama.
    const key = req.get('Idempotency-Key') || crypto.randomUUID();
    const upstream = await callYii('PUT', `/internal/lab-items/${itemId}/result`, {
      body: { ...req.valid.body, resulted_by: Number(req.user.id) },
      idempotencyKey: key,
    });
    ok(res, upstream?.data ?? { id: itemId, saved: true }, { idempotency_key: key });
  }));

module.exports = r;

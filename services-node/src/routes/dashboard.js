'use strict';
const express = require('express');
const db = require('../db');
const { z, period, withPeriod, paging } = require('../lib/schemas');
const { validate } = require('../middleware/validate');
const { requirePermission } = require('../middleware/auth');
const { ok } = require('../lib/response');

const r = express.Router();
r.use(requirePermission('report.view'));
const wrap = (fn) => (req, res, next) => fn(req, res).catch(next);

// Semua endpoint: ?from=YYYY-MM-DD&to=YYYY-MM-DD (default 30 hari terakhir).
// Kunjungan/tindakan memakai visits.visit_date; pendapatan memakai payments.paid_at;
// obat keluar memakai stock_movements.created_at. Batas atas dibuat half-open (< to+1).
const q = validate({ query: period });
const range = (req) => [req.valid.query.from, req.valid.query.to];

const sql = {
  visits: `SELECT count(*)::int AS n FROM visits
            WHERE visit_date BETWEEN $1 AND $2 AND status <> 'cancelled'`,
  procedures: `SELECT COALESCE(sum(vp.quantity),0)::int AS n
                 FROM visit_procedures vp JOIN visits v ON v.id = vp.visit_id
                WHERE v.visit_date BETWEEN $1 AND $2 AND v.status <> 'cancelled' AND vp.voided_at IS NULL`,
  // uang masuk bersih = pembayaran - refund
  revenue: `SELECT COALESCE(sum(CASE WHEN kind = 'refund' THEN -amount ELSE amount END),0)::float8 AS n FROM payments
             WHERE status = 'success' AND paid_at >= $1::date AND paid_at < ($2::date + 1)`,
  invoiced: `SELECT COALESCE(sum(i.total_amount),0)::float8 AS n
               FROM invoices i JOIN visits v ON v.id = i.visit_id
              WHERE v.visit_date BETWEEN $1 AND $2`,
  medicine: `SELECT COALESCE(sum(-quantity),0)::int AS n FROM stock_movements
              WHERE movement_type = 'dispense' AND created_at >= $1::date AND created_at < ($2::date + 1)`,
  byPoli: `SELECT po.id AS poli_id, po.name AS poli, count(v.id)::int AS visits
             FROM visits v JOIN polis po ON po.id = v.poli_id
            WHERE v.visit_date BETWEEN $1 AND $2 AND v.status <> 'cancelled'
            GROUP BY po.id, po.name ORDER BY visits DESC, po.name`,
  paymentStatus: `SELECT i.status, count(*)::int AS invoices,
                         COALESCE(sum(i.total_amount),0)::float8 AS total_amount,
                         COALESCE(sum(i.paid_amount),0)::float8 AS paid_amount
                    FROM invoices i JOIN visits v ON v.id = i.visit_id
                   WHERE v.visit_date BETWEEN $1 AND $2
                   GROUP BY i.status ORDER BY i.status`,
};

r.get('/summary', q, wrap(async (req, res) => {
  const p = range(req);
  const [visits, procedures, revenue, invoiced, medicine, byPoli, paymentStatus] = await Promise.all(
    ['visits', 'procedures', 'revenue', 'invoiced', 'medicine', 'byPoli', 'paymentStatus']
      .map((k) => db.query(sql[k], p)));
  ok(res, {
    total_visits: visits.rows[0].n,
    total_procedures: procedures.rows[0].n,
    revenue_received: revenue.rows[0].n,
    revenue_invoiced: invoiced.rows[0].n,
    medicine_units_dispensed: medicine.rows[0].n,
    visits_by_poli: byPoli.rows,
    payment_status: paymentStatus.rows,
  }, { from: p[0], to: p[1] });
}));

r.get('/visits-by-poli', q, wrap(async (req, res) => {
  const p = range(req);
  ok(res, (await db.query(sql.byPoli, p)).rows, { from: p[0], to: p[1] });
}));

r.get('/procedures', q, wrap(async (req, res) => {
  const p = range(req);
  const rows = (await db.query(
    `SELECT pr.code, pr.name, sum(vp.quantity)::int AS total_qty,
            sum(vp.quantity * vp.unit_price)::float8 AS total_amount
       FROM visit_procedures vp
       JOIN visits v ON v.id = vp.visit_id
       JOIN procedures pr ON pr.id = vp.procedure_id
      WHERE v.visit_date BETWEEN $1 AND $2 AND v.status <> 'cancelled' AND vp.voided_at IS NULL
      GROUP BY pr.code, pr.name ORDER BY total_qty DESC, pr.code`, p)).rows;
  ok(res, rows, { from: p[0], to: p[1] });
}));

r.get('/revenue', q, wrap(async (req, res) => {
  const p = range(req);
  const rows = (await db.query(
    `SELECT paid_at::date AS date,
            count(*) FILTER (WHERE kind = 'payment')::int AS payments,
            count(*) FILTER (WHERE kind = 'refund')::int AS refunds,
            sum(CASE WHEN kind = 'refund' THEN -amount ELSE amount END)::float8 AS amount,
            COALESCE(sum(CASE WHEN kind = 'refund' THEN -amount ELSE amount END) FILTER (WHERE method = 'cash'),0)::float8 AS cash,
            COALESCE(sum(CASE WHEN kind = 'refund' THEN -amount ELSE amount END) FILTER (WHERE method = 'non_cash'),0)::float8 AS non_cash
       FROM payments
      WHERE status = 'success' AND paid_at >= $1::date AND paid_at < ($2::date + 1)
      GROUP BY paid_at::date ORDER BY date`, p)).rows;
  ok(res, rows, { from: p[0], to: p[1] });
}));

r.get('/medicine-usage', q, wrap(async (req, res) => {
  const p = range(req);
  const rows = (await db.query(
    `SELECT m.code, m.name, m.unit, sum(-sm.quantity)::int AS total_qty, m.stock AS current_stock
       FROM stock_movements sm JOIN medicines m ON m.id = sm.medicine_id
      WHERE sm.movement_type = 'dispense' AND sm.created_at >= $1::date AND sm.created_at < ($2::date + 1)
      GROUP BY m.id ORDER BY total_qty DESC, m.code`, p)).rows;
  ok(res, rows, { from: p[0], to: p[1] });
}));

r.get('/payment-status', q, wrap(async (req, res) => {
  const p = range(req);
  ok(res, (await db.query(sql.paymentStatus, p)).rows, { from: p[0], to: p[1] });
}));

// Rincian (drill-down) kunjungan dengan paginasi + filter poli/status bayar.
const detailQuery = withPeriod({
  poli_id: z.coerce.number().int().positive().optional(),
  payment_status: z.enum(['unpaid', 'partial', 'paid']).optional(),
  ...paging,
});

r.get('/details/visits', validate({ query: detailQuery }), wrap(async (req, res) => {
  const { from, to, poli_id, payment_status, page, limit } = req.valid.query;
  const p = [from, to]; const w = ['v.visit_date BETWEEN $1 AND $2', "v.status <> 'cancelled'"];
  if (poli_id) { p.push(poli_id); w.push(`v.poli_id = $${p.length}`); }
  if (payment_status) { p.push(payment_status); w.push(`i.status = $${p.length}`); }
  const from_ = `FROM visits v
      JOIN patients pt ON pt.id = v.patient_id
      JOIN polis po ON po.id = v.poli_id
      JOIN medical_staff ms ON ms.id = v.doctor_id
      LEFT JOIN invoices i ON i.visit_id = v.id
     WHERE ${w.join(' AND ')}`;
  const total = (await db.query(`SELECT count(*)::int AS n ${from_}`, p)).rows[0].n;
  p.push(limit, (page - 1) * limit);
  const rows = (await db.query(
    `SELECT v.id, v.visit_date, v.queue_number, v.status,
            pt.medical_record_no, pt.name AS patient_name, po.name AS poli, ms.name AS doctor,
            i.invoice_no, i.status AS payment_status,
            COALESCE(i.total_amount,0)::float8 AS total_amount, COALESCE(i.paid_amount,0)::float8 AS paid_amount
       ${from_} ORDER BY v.visit_date DESC, v.id DESC
       LIMIT $${p.length - 1} OFFSET $${p.length}`, p)).rows;
  ok(res, rows, { from, to, page, limit, total, total_pages: Math.ceil(total / limit) });
}));

module.exports = r;

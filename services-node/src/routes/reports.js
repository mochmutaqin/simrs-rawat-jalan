/**
 * SIMRS Rawat Jalan
 *
 * @author  Mochamad Mutaqin Kurniawan <mochmutaqin@gmail.com>
 * @link    https://github.com/mochmutaqin/simrs-rawat-jalan
 */

'use strict';
// Laporan read-only: data pasien, stok obat, jumlah resep.
// Setiap endpoint mengembalikan { summary, rows } berpaginasi (format=json, default)
// atau seluruh baris sebagai file CSV (format=csv) untuk dibuka di Excel.
const express = require('express');
const db = require('../db');
const { z, withPeriod } = require('../lib/schemas');
const { validate } = require('../middleware/validate');
const { requirePermission } = require('../middleware/auth');
const { ok } = require('../lib/response');
const { sendCsv, CSV_MAX_ROWS } = require('../lib/csv');

const r = express.Router();
const wrap = (fn) => (req, res, next) => fn(req, res).catch(next);

// Laporan boleh menampilkan banyak baris sekaligus (untuk cetak), maksimal 1000 per halaman.
const reportPaging = {
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(1000).default(20),
  format: z.enum(['json', 'csv']).default('json'),
};
const search = z.string().trim().min(1).max(100).optional();

/**
 * Jalankan query laporan: hitung total, ringkasan, lalu ambil halaman yang diminta.
 * base = SELECT lengkap (tanpa ORDER/LIMIT) yang dibungkus sebagai subquery "t".
 */
async function runReport(req, res, { base, params, order, summarySql, extra, csv }) {
  const { page, limit, format, from, to } = req.valid.query;
  if (format === 'csv') {
    const rows = (await db.query(`SELECT * FROM (${base}) t ORDER BY ${order} LIMIT ${CSV_MAX_ROWS + 1}`, params)).rows;
    return sendCsv(res, `${csv.name}_${from}_${to}.csv`, csv.columns, rows);
  }
  const [summary, total, more] = await Promise.all([
    db.query(`SELECT ${summarySql} FROM (${base}) t`, params),
    db.query(`SELECT count(*)::int AS n FROM (${base}) t`, params),
    extra ? extra() : Promise.resolve({}),
  ]);
  const n = total.rows[0].n;
  const rows = (await db.query(
    `SELECT * FROM (${base}) t ORDER BY ${order} LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, limit, (page - 1) * limit])).rows;
  ok(res, { summary: { ...summary.rows[0], ...more }, rows },
    { from, to, page, limit, total: n, total_pages: Math.ceil(n / limit) });
}

const GENDER = { L: 'Laki-laki', P: 'Perempuan' };
const STOCK_STATUS = { ok: 'Aman', low: 'Menipis', out: 'Habis' };
const RX_STATUS = { pending: 'Menunggu', dispensed: 'Diserahkan', cancelled: 'Dibatalkan' };

// ---------------------------------------------------------------- data pasien
// basis=registered: pasien yang terdaftar pada periode; basis=visited: pasien yang berkunjung pada periode.
const patientQuery = withPeriod({
  basis: z.enum(['registered', 'visited']).default('registered'),
  gender: z.enum(['L', 'P']).optional(),
  q: search,
  ...reportPaging,
});

r.get('/patients', requirePermission('report.view'), validate({ query: patientQuery }), wrap(async (req, res) => {
  const { from, to, basis, gender, q } = req.valid.query;
  const params = [from, to];
  const where = ['p.deleted_at IS NULL'];
  where.push(basis === 'visited'
    ? 'COALESCE(v.visits_in_period, 0) > 0'
    : 'p.created_at >= $1::date AND p.created_at < ($2::date + 1)');
  if (gender) { params.push(gender); where.push(`p.gender = $${params.length}`); }
  if (q) {
    params.push(`%${q.toLowerCase()}%`);
    where.push(`(lower(p.name) LIKE $${params.length} OR lower(p.medical_record_no) LIKE $${params.length} OR p.nik LIKE $${params.length})`);
  }
  // kunjungan dihitung dari visits yang tidak dibatalkan; kunjungan terakhir = sepanjang waktu
  const base = `
    SELECT p.id, p.medical_record_no, p.nik, p.name, p.gender, p.birth_date,
           date_part('year', age(current_date, p.birth_date))::int AS age,
           p.phone, p.address, p.created_at::date AS registered_at,
           COALESCE(v.visits_in_period, 0)::int AS visits_in_period, v.last_visit
      FROM patients p
      LEFT JOIN (
        SELECT patient_id,
               count(*) FILTER (WHERE visit_date BETWEEN $1 AND $2) AS visits_in_period,
               max(visit_date) AS last_visit
          FROM visits WHERE status <> 'cancelled' GROUP BY patient_id
      ) v ON v.patient_id = p.id
     WHERE ${where.join(' AND ')}`;
  await runReport(req, res, {
    base, params, order: 'name, id',
    summarySql: `count(*)::int AS total_patients,
                 count(*) FILTER (WHERE gender = 'L')::int AS male,
                 count(*) FILTER (WHERE gender = 'P')::int AS female,
                 count(*) FILTER (WHERE age < 18)::int AS age_child,
                 count(*) FILTER (WHERE age BETWEEN 18 AND 59)::int AS age_adult,
                 count(*) FILTER (WHERE age >= 60)::int AS age_elderly,
                 COALESCE(sum(visits_in_period), 0)::int AS total_visits`,
    csv: {
      name: 'laporan-pasien',
      columns: [
        ['medical_record_no', 'No. RM'], ['name', 'Nama'], ['nik', 'NIK'],
        ['gender', 'Jenis kelamin', (v) => GENDER[v] || v], ['birth_date', 'Tanggal lahir'], ['age', 'Umur (tahun)'],
        ['phone', 'Telepon'], ['address', 'Alamat'], ['registered_at', 'Tanggal daftar'],
        ['visits_in_period', 'Kunjungan pada periode'], ['last_visit', 'Kunjungan terakhir'],
      ],
    },
  });
}));

// ---------------------------------------------------------------- stok obat
// Status memakai stok saat ini: habis (0), menipis (<= stok minimum), aman.
// Mutasi periode dari buku stok (stock_movements); stok awal/akhir dihitung mundur dari stok sekarang.
const stockQuery = withPeriod({
  status: z.enum(['ok', 'low', 'out']).optional(),
  q: search,
  ...reportPaging,
});

r.get('/medicine-stock', requirePermission('report.view', 'medicine.manage'), validate({ query: stockQuery }), wrap(async (req, res) => {
  const { from, to, status, q } = req.valid.query;
  const params = [from, to];
  const where = ['TRUE'];
  if (status) { params.push(status); where.push(`status = $${params.length}`); }
  if (q) { params.push(`%${q.toLowerCase()}%`); where.push(`(lower(name) LIKE $${params.length} OR lower(code) LIKE $${params.length})`); }
  const base = `
    SELECT * FROM (
      SELECT m.id, m.code, m.name, m.unit, m.price::float8 AS price, m.min_stock, m.stock,
             CASE WHEN m.stock = 0 THEN 'out' WHEN m.stock <= m.min_stock THEN 'low' ELSE 'ok' END AS status,
             (m.stock * m.price)::float8 AS stock_value,
             (m.stock - COALESCE(mv.net_since_from, 0))::int AS stock_start,
             COALESCE(mv.qty_in, 0)::int AS qty_in,
             COALESCE(mv.qty_out, 0)::int AS qty_out,
             COALESCE(mv.qty_adjust, 0)::int AS qty_adjust,
             (m.stock - COALESCE(mv.net_after_to, 0))::int AS stock_end
        FROM medicines m
        LEFT JOIN (
          SELECT medicine_id,
                 sum(quantity) AS net_since_from,
                 sum(quantity) FILTER (WHERE created_at >= ($2::date + 1)) AS net_after_to,
                 sum(quantity) FILTER (WHERE created_at < ($2::date + 1) AND movement_type = 'in') AS qty_in,
                 sum(-quantity) FILTER (WHERE created_at < ($2::date + 1) AND movement_type = 'dispense') AS qty_out,
                 sum(quantity) FILTER (WHERE created_at < ($2::date + 1) AND movement_type IN ('adjustment', 'return')) AS qty_adjust
            FROM stock_movements
           WHERE created_at >= $1::date
           GROUP BY medicine_id
        ) mv ON mv.medicine_id = m.id
       WHERE m.is_active
    ) s
    WHERE ${where.join(' AND ')}`;
  await runReport(req, res, {
    base, params, order: "CASE status WHEN 'out' THEN 0 WHEN 'low' THEN 1 ELSE 2 END, name",
    summarySql: `count(*)::int AS total_items,
                 COALESCE(sum(stock), 0)::int AS total_units,
                 COALESCE(sum(stock_value), 0)::float8 AS stock_value,
                 count(*) FILTER (WHERE status = 'ok')::int AS status_ok,
                 count(*) FILTER (WHERE status = 'low')::int AS status_low,
                 count(*) FILTER (WHERE status = 'out')::int AS status_out,
                 COALESCE(sum(qty_in), 0)::int AS total_in,
                 COALESCE(sum(qty_out), 0)::int AS total_out`,
    csv: {
      name: 'laporan-stok-obat',
      columns: [
        ['code', 'Kode'], ['name', 'Nama obat'], ['unit', 'Satuan'], ['stock_start', 'Stok awal'],
        ['qty_in', 'Masuk'], ['qty_out', 'Keluar'], ['qty_adjust', 'Penyesuaian/retur'], ['stock_end', 'Stok akhir periode'],
        ['stock', 'Stok saat ini'], ['min_stock', 'Stok minimum'], ['status', 'Status', (v) => STOCK_STATUS[v] || v],
        ['price', 'Harga satuan'], ['stock_value', 'Nilai stok'],
      ],
    },
  });
}));

// ---------------------------------------------------------------- jumlah resep
// Periode memakai tanggal resep dibuat. Item yang di-void tidak dihitung.
const rxQuery = withPeriod({
  status: z.enum(['pending', 'dispensed', 'cancelled']).optional(),
  poli_id: z.coerce.number().int().positive().optional(),
  doctor_id: z.coerce.number().int().positive().optional(),
  ...reportPaging,
});

r.get('/prescriptions', requirePermission('report.view'), validate({ query: rxQuery }), wrap(async (req, res) => {
  const { from, to, status, poli_id, doctor_id } = req.valid.query;
  const params = [from, to];
  const where = ['pr.created_at >= $1::date', 'pr.created_at < ($2::date + 1)'];
  if (status) { params.push(status); where.push(`pr.status = $${params.length}`); }
  if (poli_id) { params.push(poli_id); where.push(`v.poli_id = $${params.length}`); }
  if (doctor_id) { params.push(doctor_id); where.push(`pr.doctor_id = $${params.length}`); }
  const filter = where.join(' AND ');
  const joins = `FROM prescriptions pr
      JOIN visits v ON v.id = pr.visit_id
      JOIN patients pt ON pt.id = v.patient_id
      JOIN polis po ON po.id = v.poli_id
      JOIN medical_staff ms ON ms.id = pr.doctor_id`;
  const base = `
    SELECT pr.id, pr.created_at, pr.status, pr.dispensed_at,
           pt.medical_record_no, pt.name AS patient_name, po.name AS poli, ms.name AS doctor,
           count(pi.id) FILTER (WHERE pi.voided_at IS NULL)::int AS item_count,
           COALESCE(sum(pi.quantity) FILTER (WHERE pi.voided_at IS NULL), 0)::int AS total_qty,
           COALESCE(sum(pi.quantity * pi.unit_price) FILTER (WHERE pi.voided_at IS NULL), 0)::float8 AS total_amount
      ${joins}
      LEFT JOIN prescription_items pi ON pi.prescription_id = pr.id
     WHERE ${filter}
     GROUP BY pr.id, pt.id, po.id, ms.id`;
  // rincian per dokter dan obat terbanyak memakai filter yang sama
  const extra = async () => {
    const [byDoctor, topMedicines] = await Promise.all([
      db.query(`SELECT ms.name AS doctor, po.name AS poli,
                       count(*)::int AS total,
                       count(*) FILTER (WHERE pr.status = 'dispensed')::int AS dispensed
                  ${joins} WHERE ${filter}
                 GROUP BY ms.id, po.id ORDER BY total DESC, doctor`, params),
      db.query(`SELECT m.code, m.name, m.unit, sum(pi.quantity)::int AS total_qty, count(DISTINCT pr.id)::int AS prescriptions
                  ${joins}
                  JOIN prescription_items pi ON pi.prescription_id = pr.id AND pi.voided_at IS NULL
                  JOIN medicines m ON m.id = pi.medicine_id
                 WHERE ${filter} AND pr.status <> 'cancelled'
                 GROUP BY m.id ORDER BY total_qty DESC, m.name LIMIT 10`, params),
    ]);
    return { by_doctor: byDoctor.rows, top_medicines: topMedicines.rows };
  };
  await runReport(req, res, {
    base, params, order: 'created_at DESC, id DESC', extra,
    summarySql: `count(*)::int AS total_prescriptions,
                 count(*) FILTER (WHERE status = 'pending')::int AS pending,
                 count(*) FILTER (WHERE status = 'dispensed')::int AS dispensed,
                 count(*) FILTER (WHERE status = 'cancelled')::int AS cancelled,
                 COALESCE(sum(total_qty) FILTER (WHERE status <> 'cancelled'), 0)::int AS total_qty,
                 COALESCE(sum(total_amount) FILTER (WHERE status = 'dispensed'), 0)::float8 AS dispensed_amount`,
    csv: {
      name: 'laporan-resep',
      columns: [
        ['id', 'No. resep'], ['created_at', 'Tanggal resep', (v) => localDateTime(v)], ['medical_record_no', 'No. RM'],
        ['patient_name', 'Pasien'], ['poli', 'Poli'], ['doctor', 'Dokter'], ['status', 'Status', (v) => RX_STATUS[v] || v],
        ['item_count', 'Jumlah item'], ['total_qty', 'Jumlah obat'], ['total_amount', 'Nilai'],
        ['dispensed_at', 'Diserahkan', (v) => (v ? localDateTime(v) : '')],
      ],
    },
  });
}));

// timestamptz -> "YYYY-MM-DD HH:mm" di zona waktu rumah sakit (sama dengan sesi DB)
const dtFormat = new Intl.DateTimeFormat('sv-SE', {
  timeZone: process.env.APP_TIMEZONE || 'Asia/Jakarta',
  year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});
function localDateTime(v) {
  return dtFormat.format(v instanceof Date ? v : new Date(v));
}

module.exports = r;

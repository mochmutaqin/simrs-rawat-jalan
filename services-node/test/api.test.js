'use strict';
// Tes integrasi: Postgres nyata (skema 001_schema.sql sudah terpasang) + Yii palsu (mock HTTP).
// Env: TEST_DB_ADMIN_URL (superuser, untuk seed), DB_* untuk koneksi app_readonly.
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const jwt = require('jsonwebtoken');
const { Client } = require('pg');

const ADMIN_URL = process.env.TEST_DB_ADMIN_URL || 'postgres://postgres@localhost:5432/simrs';
const SECRET = 'test-secret';
process.env.JWT_SECRET = SECRET;
process.env.SERVICE_TOKEN = 'svc-test';
process.env.YII_SERVICE_TOKEN = 'svc-yii';
process.env.YII_RETRIES = '2';
process.env.YII_RETRY_BASE_MS = '5';
process.env.YII_TIMEOUT_MS = '500';

const _d = new Date(); const _p = (n) => String(n).padStart(2, '0');
const today = `${_d.getFullYear()}-${_p(_d.getMonth() + 1)}-${_p(_d.getDate())}`;
const token = (perms, extra = {}) =>
  jwt.sign({ sub: 7, username: 'tester', role: 'x', perms, ...extra }, SECRET, { expiresIn: '5m' });
const T = {
  lab: token(['lab.view', 'lab.result']),
  labView: token(['lab.view']),
  report: token(['report.view']),
  none: token([]),
};

let yii, yiiBase, server, base, admin;
const yiiCalls = [];
let yiiMode = 'ok';           // ok | flaky | down | reject

async function api(method, path, { tok, body, headers } = {}) {
  const res = await fetch(base + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(tok ? { Authorization: `Bearer ${tok}` } : {}), ...headers },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, json: await res.json() };
}

test.before(async () => {
  yii = http.createServer((req, res) => {
    let raw = ''; req.on('data', (c) => (raw += c));
    req.on('end', () => {
      yiiCalls.push({ method: req.method, url: req.url, headers: req.headers, body: raw ? JSON.parse(raw) : null });
      const send = (s, o) => { res.writeHead(s, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(o)); };
      if (yiiMode === 'down') return req.socket.destroy();
      if (yiiMode === 'flaky' && yiiCalls.length < 3) return send(500, { error: 'boom' });
      if (yiiMode === 'reject') return send(422, { error: { code: 'LAB_ALREADY_FINAL', message: 'Hasil sudah final' } });
      send(200, { data: { id: 1, saved: true } });
    });
  });
  await new Promise((r) => yii.listen(0, r));
  process.env.YII_BASE_URL = `http://127.0.0.1:${yii.address().port}`;

  const app = require('../src/app');
  server = http.createServer(app);
  await new Promise((r) => server.listen(0, r));
  base = `http://127.0.0.1:${server.address().port}`;

  admin = new Client({ connectionString: ADMIN_URL });
  await admin.connect();
  await admin.query(`TRUNCATE visits, patients, polis, medical_staff, procedures, medicines, lab_tests,
                     queue_counters, audit_logs, outbox_events RESTART IDENTITY CASCADE`);
  await admin.query(`
    INSERT INTO polis (code,name,registration_fee) VALUES ('UMUM','Poli Umum',25000),('GIGI','Poli Gigi',30000);
    INSERT INTO medical_staff (staff_type,name) VALUES ('doctor','dr. Satu');
    INSERT INTO patients (nik,name,birth_date,gender) VALUES
      ('3273010101900001','Ani','1990-01-01','P'),('3273010101900002','Budi','1985-05-05','L'),
      ('3273010101900003','Citra','1992-03-03','P'),('3273010101900004','Dedi','1980-04-04','L');
    INSERT INTO visits (patient_id,poli_id,doctor_id,visit_date,queue_number,status,registration_fee) VALUES
      (1,1,1,'${today}',1,'completed',25000),(2,1,1,'${today}',2,'completed',25000),
      (3,2,1,'${today}',3,'completed',30000),(4,1,1,'${today}',4,'cancelled',25000);
    INSERT INTO procedures (code,name,price) VALUES ('T01','Jahit luka',50000);
    INSERT INTO visit_procedures (visit_id,procedure_id,quantity,unit_price) VALUES (1,1,2,50000),(2,1,1,50000);
    INSERT INTO medicines (code,name,unit,stock,price) VALUES ('PCT','Paracetamol','tablet',90,1000);
    INSERT INTO stock_movements (medicine_id,movement_type,quantity,stock_after) VALUES (1,'dispense',-10,90);
    INSERT INTO lab_tests (code,name,price,unit,ref_range) VALUES ('HB','Hemoglobin',40000,'g/dL','12-16'),('GDS','Gula Darah',30000,'mg/dL','<140');
    INSERT INTO invoices (visit_id) VALUES (1),(2),(3);
    INSERT INTO invoice_items (invoice_id,item_type,source_id,description,quantity,unit_price) VALUES
      (1,'registration',1,'Daftar',1,25000),(1,'procedure',1,'Jahit',1,25000),
      (2,'registration',2,'Daftar',1,30000),
      (3,'registration',3,'Daftar',1,30000);
    INSERT INTO payments (invoice_id,amount,method,idempotency_key,paid_at) VALUES
      (1,50000,'cash','k1','${today} 12:00:00+00'),(2,10000,'non_cash','k2','${today} 12:00:00+00');
    INSERT INTO lab_requests (visit_id,requested_by,status) VALUES (1,1,'requested');
    INSERT INTO lab_request_items (lab_request_id,lab_test_id,unit_price) VALUES (1,1,40000),(1,2,30000);
  `);
});

test.after(async () => {
  await admin?.end();
  await new Promise((r) => server.close(r));
  await new Promise((r) => yii.close(r));
  await require('../src/db').close();
});

test.beforeEach(() => { yiiCalls.length = 0; yiiMode = 'ok'; });

// ---------------- umum & auth ----------------
test('health: database up', async () => {
  const r = await api('GET', '/health');
  assert.equal(r.status, 200);
  assert.equal(r.json.data.database, 'up');
});

test('route tidak ada -> format error konsisten', async () => {
  const r = await api('GET', '/api/v1/nope', { tok: T.lab });
  assert.equal(r.status, 404);
  assert.deepEqual(Object.keys(r.json), ['success', 'error']);
  assert.equal(r.json.error.code, 'NOT_FOUND');
});

test('tanpa token -> 401; token rusak -> 401; kedaluwarsa -> 401', async () => {
  assert.equal((await api('GET', '/api/v1/lab/requests')).status, 401);
  assert.equal((await api('GET', '/api/v1/lab/requests', { tok: 'abc.def.ghi' })).status, 401);
  const expired = jwt.sign({ sub: 1, perms: ['lab.view'] }, SECRET, { expiresIn: -10 });
  const r = await api('GET', '/api/v1/lab/requests', { tok: expired });
  assert.equal(r.status, 401);
  assert.match(r.json.error.message, /kedaluwarsa/);
});

test('RBAC: permission kurang -> 403', async () => {
  assert.equal((await api('GET', '/api/v1/lab/requests', { tok: T.none })).status, 403);
  assert.equal((await api('GET', '/api/v1/dashboard/summary', { tok: T.lab })).status, 403);
  const r = await api('POST', '/api/v1/lab/items/1/result', { tok: T.labView, body: { result_value: '1' } });
  assert.equal(r.status, 403);
});

// ---------------- lab (baca) ----------------
test('lab: daftar permintaan + paginasi', async () => {
  const r = await api('GET', '/api/v1/lab/requests?status=requested&limit=5', { tok: T.labView });
  assert.equal(r.status, 200);
  assert.equal(r.json.meta.total, 1);
  assert.equal(r.json.data[0].item_count, 2);
  assert.equal(r.json.data[0].resulted_count, 0);
  assert.equal(r.json.data[0].patient_name, 'Ani');
});

test('lab: validasi query -> 400 dengan detail field', async () => {
  const r = await api('GET', '/api/v1/lab/requests?status=ngawur&limit=1000', { tok: T.labView });
  assert.equal(r.status, 400);
  assert.equal(r.json.error.code, 'BAD_REQUEST');
  assert.ok(r.json.error.details.some((d) => d.field === 'status'));
  assert.ok(r.json.error.details.some((d) => d.field === 'limit'));
});

test('lab: detail, 404, dan hasil per kunjungan', async () => {
  const d = await api('GET', '/api/v1/lab/requests/1', { tok: T.labView });
  assert.equal(d.status, 200);
  assert.deepEqual(d.json.data.items.map((i) => i.code), ['HB', 'GDS']);
  assert.equal((await api('GET', '/api/v1/lab/requests/999', { tok: T.labView })).status, 404);
  const v = await api('GET', '/api/v1/lab/visits/1/results', { tok: T.labView });
  assert.equal(v.json.data.length, 2);
});

// ---------------- lab (tulis hasil -> Yii) ----------------
test('hasil lab diteruskan ke Yii dengan service token, idempotency key, dan resulted_by', async () => {
  const r = await api('POST', '/api/v1/lab/items/1/result', {
    tok: T.lab, headers: { 'Idempotency-Key': 'abc-123' },
    body: { result_value: '13.5', result_unit: 'g/dL', result_flag: 'normal' },
  });
  assert.equal(r.status, 200);
  assert.equal(r.json.meta.idempotency_key, 'abc-123');
  assert.equal(yiiCalls.length, 1);
  const c = yiiCalls[0];
  assert.equal(c.method, 'PUT');
  assert.equal(c.url, '/internal/lab-items/1/result');
  assert.equal(c.headers['x-service-token'], 'svc-yii');
  assert.equal(c.headers['idempotency-key'], 'abc-123');
  assert.equal(c.body.resulted_by, 7);
  assert.equal(c.body.result_value, '13.5');
});

test('hasil lab: body tidak valid / field asing ditolak sebelum menyentuh Yii', async () => {
  const a = await api('POST', '/api/v1/lab/items/1/result', { tok: T.lab, body: { result_value: '' } });
  const b = await api('POST', '/api/v1/lab/items/1/result', { tok: T.lab, body: { result_value: '1', hack: true } });
  const c = await api('POST', '/api/v1/lab/items/999/result', { tok: T.lab, body: { result_value: '1' } });
  assert.deepEqual([a.status, b.status, c.status], [400, 400, 404]);
  assert.equal(yiiCalls.length, 0);
});

test('gangguan Yii sesaat: retry otomatis dengan kunci idempotensi yang SAMA', async () => {
  yiiMode = 'flaky';                     // 2 panggilan pertama 500, ketiga sukses
  const r = await api('POST', '/api/v1/lab/items/1/result', { tok: T.lab, body: { result_value: '14' } });
  assert.equal(r.status, 200);
  assert.equal(yiiCalls.length, 3);
  const keys = new Set(yiiCalls.map((c) => c.headers['idempotency-key']));
  assert.equal(keys.size, 1);
  assert.ok([...keys][0]);
});

test('Yii mati total: 503 konsisten, tidak ada klaim sukses', async () => {
  yiiMode = 'down';
  const r = await api('POST', '/api/v1/lab/items/1/result', { tok: T.lab, body: { result_value: '14' } });
  assert.equal(r.status, 503);
  assert.equal(r.json.success, false);
  assert.equal(r.json.error.code, 'UPSTREAM_UNAVAILABLE');
  assert.equal(r.json.error.details.attempts, 3);
});

test('penolakan bisnis Yii (4xx) diteruskan tanpa retry', async () => {
  yiiMode = 'reject';
  const r = await api('POST', '/api/v1/lab/items/1/result', { tok: T.lab, body: { result_value: '14' } });
  assert.equal(r.status, 422);
  assert.equal(r.json.error.code, 'LAB_ALREADY_FINAL');
  assert.equal(yiiCalls.length, 1);
});

// ---------------- dashboard ----------------
test('dashboard summary: angka cocok dengan data seed', async () => {
  const r = await api('GET', `/api/v1/dashboard/summary?from=${today}&to=${today}`, { tok: T.report });
  assert.equal(r.status, 200);
  const d = r.json.data;
  assert.equal(d.total_visits, 3);                 // kunjungan batal tidak dihitung
  assert.equal(d.total_procedures, 3);             // 2 + 1
  assert.equal(d.revenue_received, 60000);         // 50.000 + 10.000
  assert.equal(d.revenue_invoiced, 110000);        // 50.000 + 30.000 + 30.000
  assert.equal(d.medicine_units_dispensed, 10);
  assert.deepEqual(d.visits_by_poli.map((p) => [p.poli, p.visits]), [['Poli Umum', 2], ['Poli Gigi', 1]]);
  const ps = Object.fromEntries(d.payment_status.map((p) => [p.status, p.invoices]));
  assert.deepEqual(ps, { paid: 1, partial: 1, unpaid: 1 });
});

test('dashboard: endpoint rincian & filter', async () => {
  const q = `from=${today}&to=${today}`;
  const proc = await api('GET', `/api/v1/dashboard/procedures?${q}`, { tok: T.report });
  assert.deepEqual([proc.json.data[0].total_qty, proc.json.data[0].total_amount], [3, 150000]);
  const rev = await api('GET', `/api/v1/dashboard/revenue?${q}`, { tok: T.report });
  assert.deepEqual([rev.json.data[0].cash, rev.json.data[0].non_cash], [50000, 10000]);
  const med = await api('GET', `/api/v1/dashboard/medicine-usage?${q}`, { tok: T.report });
  assert.equal(med.json.data[0].total_qty, 10);
  const det = await api('GET', `/api/v1/dashboard/details/visits?${q}&payment_status=partial&limit=10`, { tok: T.report });
  assert.equal(det.json.meta.total, 1);
  assert.equal(det.json.data[0].patient_name, 'Budi');
  const poli = await api('GET', `/api/v1/dashboard/details/visits?${q}&poli_id=2`, { tok: T.report });
  assert.equal(poli.json.meta.total, 1);
});

test('dashboard: periode tidak valid -> 400', async () => {
  const a = await api('GET', '/api/v1/dashboard/summary?from=2026-12-31&to=2026-01-01', { tok: T.report });
  const b = await api('GET', '/api/v1/dashboard/summary?from=kemarin', { tok: T.report });
  const c = await api('GET', '/api/v1/dashboard/summary?from=2020-01-01&to=2026-01-01', { tok: T.report });
  assert.deepEqual([a.status, b.status, c.status], [400, 400, 400]);
});

test('dashboard: tanpa filter -> default 30 hari terakhir', async () => {
  const r = await api('GET', '/api/v1/dashboard/summary', { tok: T.report });
  assert.equal(r.status, 200);
  assert.equal(r.json.meta.to, today);
  assert.equal(r.json.data.total_visits, 3);
});

// ---------------- pemisahan tanggung jawab ----------------
test('Node tidak bisa menulis ke tabel bisnis (user DB read-only)', async () => {
  const db = require('../src/db');
  await assert.rejects(db.query(`INSERT INTO roles (code,name) VALUES ('x','x')`), /permission denied/);
  await assert.rejects(db.query(`UPDATE medicines SET stock = 0`), /permission denied/);
});

// ---------------- integrasi event ----------------
test('event integrasi: wajib service token, idempoten pada duplikat', async () => {
  const body = { id: 'evt-1', type: 'lab.requested', payload: { lab_request_id: 1 } };
  assert.equal((await api('POST', '/api/v1/integration/events', { body })).status, 401);
  const h = { 'X-Service-Token': 'svc-test' };
  const a = await api('POST', '/api/v1/integration/events', { body, headers: h });
  const b = await api('POST', '/api/v1/integration/events', { body, headers: h });
  assert.equal(a.status, 202); assert.equal(a.json.data.duplicate, false);
  assert.equal(b.status, 202); assert.equal(b.json.data.duplicate, true);
  const bad = await api('POST', '/api/v1/integration/events', { body: { id: 'x', type: 'aneh' }, headers: h });
  assert.equal(bad.status, 400);
});

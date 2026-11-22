-- Bukti constraint/trigger untuk skenario D (jalankan setelah 001_schema.sql).
-- Author: Mochamad Mutaqin Kurniawan <mochmutaqin@gmail.com>
-- Semua dibungkus transaksi lalu ROLLBACK, jadi DB tetap bersih.
-- Jalankan: psql -d simrs -f 002_constraint_tests.sql
\set ON_ERROR_STOP off
BEGIN;

-- data dummy
INSERT INTO polis (code,name,registration_fee) VALUES ('UMUM','Poli Umum',25000);
INSERT INTO medical_staff (staff_type,name) VALUES ('doctor','dr. Dummy');
INSERT INTO patients (nik,name,birth_date,gender) VALUES ('3273010101900001','Pasien Satu','1990-01-01','L');
INSERT INTO medicines (code,name,unit,stock,price) VALUES ('PCT','Paracetamol','tablet',1,1000);

\echo '--- D1a: antrean atomik (counter naik 1,2) ---'
INSERT INTO queue_counters (doctor_id,queue_date,last_number) VALUES (1,current_date,1)
  ON CONFLICT (doctor_id,queue_date) DO UPDATE SET last_number = queue_counters.last_number + 1 RETURNING last_number;
INSERT INTO queue_counters (doctor_id,queue_date,last_number) VALUES (1,current_date,1)
  ON CONFLICT (doctor_id,queue_date) DO UPDATE SET last_number = queue_counters.last_number + 1 RETURNING last_number;

\echo '--- D1b: kunjungan ganda pasien/poli/hari harus DITOLAK ---'
INSERT INTO visits (patient_id,poli_id,doctor_id,queue_number,registration_fee) VALUES (1,1,1,1,25000);
SAVEPOINT s1;
INSERT INTO visits (patient_id,poli_id,doctor_id,queue_number,registration_fee) VALUES (1,1,1,2,25000);
ROLLBACK TO s1;
\echo '--- D1c: nomor antrean kembar harus DITOLAK ---'
INSERT INTO patients (name,birth_date,gender) VALUES ('Pasien Dua','1991-02-02','P');
INSERT INTO visits (patient_id,poli_id,doctor_id,queue_number) VALUES (2,1,1,1);
ROLLBACK TO s1;

\echo '--- D2: stok tidak boleh minus (UPDATE atomik, 1 stok untuk 2 transaksi) ---'
UPDATE medicines SET stock = stock - 1 WHERE id = 1 AND stock >= 1 RETURNING stock;   -- transaksi A: berhasil
UPDATE medicines SET stock = stock - 1 WHERE id = 1 AND stock >= 1 RETURNING stock;   -- transaksi B: 0 baris
SAVEPOINT s2;
UPDATE medicines SET stock = stock - 1 WHERE id = 1;                                  -- tanpa guard: CHECK menolak
ROLLBACK TO s2;

\echo '--- Billing: invoice + item, total otomatis ---'
INSERT INTO invoices (visit_id) VALUES (1);
INSERT INTO invoice_items (invoice_id,item_type,source_id,description,quantity,unit_price)
  VALUES (1,'registration',1,'Biaya pendaftaran',1,25000),
         (1,'medicine',1,'Paracetamol',10,1000);
SELECT invoice_no,total_amount,paid_amount,status FROM invoices;

\echo '--- D3: pembayaran sebagian, lalu retry dengan idempotency key sama harus DITOLAK ---'
INSERT INTO payments (invoice_id,amount,method,idempotency_key) VALUES (1,15000,'cash','KEY-001');
SAVEPOINT s3;
INSERT INTO payments (invoice_id,amount,method,idempotency_key) VALUES (1,15000,'cash','KEY-001');
ROLLBACK TO s3;
SELECT status,total_amount,paid_amount FROM invoices;

\echo '--- Bayar melebihi sisa harus DITOLAK ---'
SAVEPOINT s4;
INSERT INTO payments (invoice_id,amount,method,idempotency_key) VALUES (1,99999,'non_cash','KEY-002');
ROLLBACK TO s4;

\echo '--- Pelunasan -> status paid ---'
INSERT INTO payments (invoice_id,amount,method,channel,idempotency_key) VALUES (1,20000,'non_cash','qris','KEY-003');
SELECT status,total_amount,paid_amount FROM invoices;

\echo '--- D4: void item + tambah item baru, audit trail tercatat ---'
SET LOCAL app.user_id = '1';
SET LOCAL app.change_reason = 'Koreksi tindakan oleh dokter';
UPDATE invoice_items SET voided_at = now(), void_reason = 'Diagnosis diubah' WHERE id = 2;
SELECT table_name, action, reason FROM audit_logs WHERE table_name='invoice_items' ORDER BY id DESC LIMIT 2;
SELECT status,total_amount,paid_amount FROM invoices;

ROLLBACK;

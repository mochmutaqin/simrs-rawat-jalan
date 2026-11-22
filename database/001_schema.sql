-- =====================================================================
-- SIMRS Rawat Jalan - PostgreSQL schema (Fase 1)
-- Author: Mochamad Mutaqin Kurniawan <mochmutaqin@gmail.com>
-- Instalasi:  psql -U postgres -d simrs -v ON_ERROR_STOP=1 -f 001_schema.sql
-- Catatan:
--   * Semua PK bernama "id" (dibutuhkan fn_audit()).
--   * Hapus data master = soft delete (deleted_at / is_active); FK RESTRICT.
--   * Harga/tarif di tabel transaksi disimpan sebagai snapshot (unit_price)
--     supaya perubahan master tidak mengubah tagihan lama.
--   * Aplikasi (Yii) mengisi konteks audit per transaksi:
--       SET LOCAL app.user_id = '<id>'; SET LOCAL app.change_reason = '<alasan>';
-- =====================================================================
BEGIN;

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE SEQUENCE seq_medical_record_no START 1;
CREATE SEQUENCE seq_invoice_no        START 1;
CREATE SEQUENCE seq_receipt_no        START 1;

-- ---------------------------------------------------------------------
-- 1. AUTH & RBAC
-- ---------------------------------------------------------------------
CREATE TABLE roles (
    id    smallint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    code  text NOT NULL UNIQUE,
    name  text NOT NULL
);

CREATE TABLE permissions (
    id          smallint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    code        text NOT NULL UNIQUE,          -- contoh: exam.manage
    description text NOT NULL
);

CREATE TABLE role_permissions (
    role_id       smallint NOT NULL REFERENCES roles(id)       ON DELETE CASCADE,
    permission_id smallint NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
    PRIMARY KEY (role_id, permission_id)
);

CREATE TABLE users (
    id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    username      text        NOT NULL,
    password_hash text        NOT NULL,
    full_name     text        NOT NULL,
    email         text,
    role_id       smallint    NOT NULL REFERENCES roles(id),
    is_active     boolean     NOT NULL DEFAULT true,
    last_login_at timestamptz,
    created_at    timestamptz NOT NULL DEFAULT now(),
    updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX ux_users_username ON users (lower(username));

-- ---------------------------------------------------------------------
-- 2. MASTER DATA
-- ---------------------------------------------------------------------
CREATE TABLE polis (
    id               bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    code             text          NOT NULL UNIQUE,
    name             text          NOT NULL,
    registration_fee numeric(12,2) NOT NULL DEFAULT 0 CHECK (registration_fee >= 0),
    is_active        boolean       NOT NULL DEFAULT true
);

CREATE TABLE medical_staff (
    id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id        bigint UNIQUE REFERENCES users(id),
    staff_type     text NOT NULL CHECK (staff_type IN ('doctor','nurse','pharmacist','lab_analyst')),
    str_no         text UNIQUE,                 -- nomor STR/SIP, unik bila diisi
    name           text NOT NULL,
    specialization text,
    phone          text,
    is_active      boolean NOT NULL DEFAULT true
);

CREATE TABLE doctor_schedules (
    id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    doctor_id   bigint   NOT NULL REFERENCES medical_staff(id),
    poli_id     bigint   NOT NULL REFERENCES polis(id),
    day_of_week smallint NOT NULL CHECK (day_of_week BETWEEN 1 AND 7),  -- ISO: 1=Senin
    start_time  time     NOT NULL,
    end_time    time     NOT NULL,
    quota       integer  NOT NULL DEFAULT 30 CHECK (quota > 0),
    is_active   boolean  NOT NULL DEFAULT true,
    CHECK (end_time > start_time),
    UNIQUE (doctor_id, poli_id, day_of_week, start_time)
);

CREATE TABLE patients (
    id                bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    medical_record_no text NOT NULL UNIQUE
        DEFAULT ('RM-' || lpad(nextval('seq_medical_record_no')::text, 6, '0')),
    nik               text UNIQUE CHECK (nik ~ '^[0-9]{16}$'),
    name              text NOT NULL,
    birth_date        date NOT NULL CHECK (birth_date <= current_date),
    gender            char(1) NOT NULL CHECK (gender IN ('L','P')),
    address           text,
    phone             text,
    deleted_at        timestamptz,
    created_at        timestamptz NOT NULL DEFAULT now(),
    updated_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ix_patients_name_trgm ON patients USING gin (lower(name) gin_trgm_ops);
CREATE INDEX ix_patients_dup_check ON patients (lower(name), birth_date);

CREATE TABLE procedures (
    id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    code       text          NOT NULL UNIQUE,
    name       text          NOT NULL,
    price      numeric(12,2) NOT NULL CHECK (price >= 0),
    is_active  boolean       NOT NULL DEFAULT true
);

CREATE TABLE medicines (
    id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    code       text          NOT NULL UNIQUE,
    name       text          NOT NULL,
    unit       text          NOT NULL,                       -- tablet, botol, dst.
    stock      integer       NOT NULL DEFAULT 0 CHECK (stock >= 0),   -- jaring pengaman terakhir (skenario D2)
    min_stock  integer       NOT NULL DEFAULT 0 CHECK (min_stock >= 0),
    price      numeric(12,2) NOT NULL CHECK (price >= 0),
    is_active  boolean       NOT NULL DEFAULT true
);

CREATE TABLE lab_tests (
    id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    code        text          NOT NULL UNIQUE,
    name        text          NOT NULL,
    price       numeric(12,2) NOT NULL CHECK (price >= 0),
    unit        text,
    ref_range   text,
    is_active   boolean       NOT NULL DEFAULT true
);

-- ---------------------------------------------------------------------
-- 3. PENDAFTARAN & ANTREAN
-- ---------------------------------------------------------------------
-- Counter antrean per dokter per hari. Naik atomik lewat
-- INSERT ... ON CONFLICT DO UPDATE ... RETURNING (lihat docs, skenario D1).
CREATE TABLE queue_counters (
    doctor_id   bigint  NOT NULL REFERENCES medical_staff(id),
    queue_date  date    NOT NULL,
    last_number integer NOT NULL DEFAULT 0,
    PRIMARY KEY (doctor_id, queue_date)
);

CREATE TABLE visits (
    id               bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    patient_id       bigint        NOT NULL REFERENCES patients(id),
    poli_id          bigint        NOT NULL REFERENCES polis(id),
    doctor_id        bigint        NOT NULL REFERENCES medical_staff(id),  -- harus staff_type='doctor' (divalidasi aplikasi)
    schedule_id      bigint        REFERENCES doctor_schedules(id),
    visit_date       date          NOT NULL DEFAULT current_date,
    queue_number     integer       NOT NULL CHECK (queue_number > 0),
    status           text          NOT NULL DEFAULT 'waiting'
        CHECK (status IN ('waiting','in_exam','exam_done','completed','cancelled')),
    registration_fee numeric(12,2) NOT NULL DEFAULT 0 CHECK (registration_fee >= 0),
    notes            text,
    created_by       bigint        REFERENCES users(id),
    created_at       timestamptz   NOT NULL DEFAULT now(),
    updated_at       timestamptz   NOT NULL DEFAULT now(),
    -- nomor antrean tidak boleh kembar (skenario D1)
    CONSTRAINT ux_visits_queue UNIQUE (doctor_id, visit_date, queue_number)
);
-- pasien yang sama tidak boleh punya 2 kunjungan aktif di poli & hari yang sama (skenario D1)
CREATE UNIQUE INDEX ux_visits_no_duplicate
    ON visits (patient_id, poli_id, visit_date) WHERE status <> 'cancelled';

-- ---------------------------------------------------------------------
-- 4. PEMERIKSAAN & REKAM MEDIS
-- ---------------------------------------------------------------------
CREATE TABLE examinations (
    id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    visit_id        bigint  NOT NULL UNIQUE REFERENCES visits(id),
    doctor_id       bigint  NOT NULL REFERENCES medical_staff(id),
    anamnesis       text,
    chief_complaint text,
    bp_systolic     smallint CHECK (bp_systolic  BETWEEN 30 AND 300),
    bp_diastolic    smallint CHECK (bp_diastolic BETWEEN 20 AND 200),
    heart_rate      smallint CHECK (heart_rate   BETWEEN 20 AND 300),
    resp_rate       smallint CHECK (resp_rate    BETWEEN 4  AND 80),
    temperature     numeric(4,1) CHECK (temperature BETWEEN 25 AND 45),
    spo2            smallint CHECK (spo2 BETWEEN 0 AND 100),
    weight_kg       numeric(5,2) CHECK (weight_kg > 0),
    height_cm       numeric(5,1) CHECK (height_cm > 0),
    physical_exam   text,
    status          text    NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','final')),
    version         integer NOT NULL DEFAULT 1,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now()
);

-- Diagnosis tidak di-update/hapus fisik: diubah dengan void + insert baru (riwayat tetap ada).
CREATE TABLE examination_diagnoses (
    id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    examination_id bigint NOT NULL REFERENCES examinations(id),
    icd10_code     text   NOT NULL,
    diagnosis_name text   NOT NULL,
    diagnosis_type text   NOT NULL CHECK (diagnosis_type IN ('primary','secondary')),
    voided_at      timestamptz,
    void_reason    text,
    created_at     timestamptz NOT NULL DEFAULT now()
);
-- maksimal satu diagnosis utama aktif per pemeriksaan
CREATE UNIQUE INDEX ux_exam_one_primary
    ON examination_diagnoses (examination_id)
    WHERE diagnosis_type = 'primary' AND voided_at IS NULL;
-- kode ICD-10 yang sama tidak boleh dobel aktif
CREATE UNIQUE INDEX ux_exam_diag_code
    ON examination_diagnoses (examination_id, icd10_code) WHERE voided_at IS NULL;

-- ---------------------------------------------------------------------
-- 5. TINDAKAN MEDIS
-- ---------------------------------------------------------------------
CREATE TABLE visit_procedures (
    id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    visit_id     bigint        NOT NULL REFERENCES visits(id),
    procedure_id bigint        NOT NULL REFERENCES procedures(id),
    quantity     integer       NOT NULL DEFAULT 1 CHECK (quantity > 0),
    unit_price   numeric(12,2) NOT NULL CHECK (unit_price >= 0),   -- snapshot tarif
    notes        text,
    performed_by bigint        REFERENCES medical_staff(id),
    voided_at    timestamptz,
    void_reason  text,
    created_at   timestamptz   NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------
-- 6. FARMASI
-- ---------------------------------------------------------------------
CREATE TABLE prescriptions (
    id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    visit_id      bigint NOT NULL REFERENCES visits(id),
    doctor_id     bigint NOT NULL REFERENCES medical_staff(id),
    status        text   NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending','dispensed','cancelled')),
    notes         text,
    dispensed_by  bigint REFERENCES users(id),
    dispensed_at  timestamptz,
    created_at    timestamptz NOT NULL DEFAULT now(),
    updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE prescription_items (
    id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    prescription_id bigint        NOT NULL REFERENCES prescriptions(id),
    medicine_id     bigint        NOT NULL REFERENCES medicines(id),
    dose            text          NOT NULL,       -- mis. 500 mg
    frequency       text          NOT NULL,       -- mis. 3x sehari
    quantity        integer       NOT NULL CHECK (quantity > 0),
    unit_price      numeric(12,2) NOT NULL CHECK (unit_price >= 0),   -- snapshot harga
    instructions    text,
    voided_at       timestamptz,
    created_at      timestamptz   NOT NULL DEFAULT now()
);

-- Ledger mutasi stok = sumber riwayat penggunaan obat.
CREATE TABLE stock_movements (
    id                   bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    medicine_id          bigint  NOT NULL REFERENCES medicines(id),
    movement_type        text    NOT NULL CHECK (movement_type IN ('in','dispense','adjustment','return')),
    quantity             integer NOT NULL CHECK (quantity <> 0),   -- bertanda: keluar negatif
    stock_after          integer NOT NULL CHECK (stock_after >= 0),
    prescription_item_id bigint  REFERENCES prescription_items(id),
    note                 text,
    created_by           bigint  REFERENCES users(id),
    created_at           timestamptz NOT NULL DEFAULT now()
);
-- satu item resep hanya boleh dikeluarkan sekali (cegah dispense ganda)
CREATE UNIQUE INDEX ux_stock_dispense_once
    ON stock_movements (prescription_item_id) WHERE movement_type = 'dispense';

-- ---------------------------------------------------------------------
-- 7. PEMERIKSAAN PENUNJANG (LAB)
-- ---------------------------------------------------------------------
CREATE TABLE lab_requests (
    id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    visit_id     bigint NOT NULL REFERENCES visits(id),
    requested_by bigint NOT NULL REFERENCES medical_staff(id),
    status       text   NOT NULL DEFAULT 'requested'
        CHECK (status IN ('requested','in_progress','completed','cancelled')),
    notes        text,
    created_at   timestamptz NOT NULL DEFAULT now(),
    updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE lab_request_items (
    id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    lab_request_id bigint        NOT NULL REFERENCES lab_requests(id),
    lab_test_id    bigint        NOT NULL REFERENCES lab_tests(id),
    unit_price     numeric(12,2) NOT NULL CHECK (unit_price >= 0),   -- snapshot tarif
    result_value   text,
    result_unit    text,
    ref_range      text,
    result_flag    text CHECK (result_flag IN ('normal','high','low','abnormal')),
    result_notes   text,
    resulted_by    bigint REFERENCES users(id),
    resulted_at    timestamptz,
    voided_at      timestamptz,
    created_at     timestamptz   NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------
-- 8. BILLING & PEMBAYARAN
-- ---------------------------------------------------------------------
CREATE TABLE invoices (
    id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    invoice_no   text NOT NULL UNIQUE
        DEFAULT ('INV-' || to_char(now(),'YYYYMM') || '-' || lpad(nextval('seq_invoice_no')::text, 6, '0')),
    visit_id     bigint NOT NULL UNIQUE REFERENCES visits(id),       -- 1 kunjungan = 1 invoice
    status       text   NOT NULL DEFAULT 'unpaid' CHECK (status IN ('unpaid','partial','paid')),
    total_amount numeric(14,2) NOT NULL DEFAULT 0 CHECK (total_amount >= 0),
    paid_amount  numeric(14,2) NOT NULL DEFAULT 0 CHECK (paid_amount  >= 0),
    revision     integer       NOT NULL DEFAULT 1,
    created_by   bigint REFERENCES users(id),
    created_at   timestamptz NOT NULL DEFAULT now(),
    updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE invoice_items (
    id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    invoice_id  bigint        NOT NULL REFERENCES invoices(id),
    item_type   text          NOT NULL CHECK (item_type IN ('registration','procedure','lab','medicine')),
    source_id   bigint        NOT NULL,       -- id baris sumber (visit/visit_procedure/lab_request_item/prescription_item)
    description text          NOT NULL,
    quantity    integer       NOT NULL DEFAULT 1 CHECK (quantity > 0),
    unit_price  numeric(12,2) NOT NULL CHECK (unit_price >= 0),
    subtotal    numeric(14,2) GENERATED ALWAYS AS (quantity * unit_price) STORED,
    voided_at   timestamptz,
    void_reason text,
    created_at  timestamptz   NOT NULL DEFAULT now()
);
-- satu sumber tidak boleh ditagihkan dua kali selama masih aktif
CREATE UNIQUE INDEX ux_invoice_item_source
    ON invoice_items (invoice_id, item_type, source_id) WHERE voided_at IS NULL;

CREATE TABLE payments (
    id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    receipt_no      text NOT NULL UNIQUE
        DEFAULT ('PAY-' || to_char(now(),'YYYYMM') || '-' || lpad(nextval('seq_receipt_no')::text, 6, '0')),
    invoice_id      bigint        NOT NULL REFERENCES invoices(id),
    amount          numeric(14,2) NOT NULL CHECK (amount > 0),
    kind            text          NOT NULL DEFAULT 'payment' CHECK (kind IN ('payment','refund')),
    method          text          NOT NULL CHECK (method IN ('cash','non_cash')),
    channel         text,                       -- simulasi: qris / debit / transfer
    reference_no    text,
    idempotency_key text          NOT NULL UNIQUE,   -- kunci anti pembayaran ganda (skenario D3)
    status          text          NOT NULL DEFAULT 'success' CHECK (status IN ('success','void')),
    paid_at         timestamptz   NOT NULL DEFAULT now(),
    received_by     bigint        REFERENCES users(id),
    created_at      timestamptz   NOT NULL DEFAULT now()
);

-- Kunci idempotensi untuk endpoint yang dipanggil ulang (mis. hasil lab dari Node).
-- Request kedua dengan kunci sama -> kembalikan respons tersimpan, tidak diproses ulang.
CREATE TABLE idempotency_keys (
    key          text        NOT NULL,
    scope        text        NOT NULL,          -- mis. lab.result
    request_hash text        NOT NULL,          -- cegah kunci sama dipakai untuk payload berbeda
    status_code  smallint    NOT NULL,
    response     jsonb       NOT NULL,
    created_at   timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (scope, key)
);

-- ---------------------------------------------------------------------
-- 9. AUDIT & OUTBOX
-- ---------------------------------------------------------------------
CREATE TABLE audit_logs (
    id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    table_name text   NOT NULL,
    record_id  text   NOT NULL,
    action     text   NOT NULL CHECK (action IN ('INSERT','UPDATE','DELETE')),
    old_data   jsonb,
    new_data   jsonb,
    changed_by bigint,
    reason     text,
    changed_at timestamptz NOT NULL DEFAULT now()
);

-- Transactional outbox: event ditulis satu transaksi dengan data bisnis,
-- lalu dikirim worker ke Node.js dengan retry (skenario D5).
CREATE TABLE outbox_events (
    id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    aggregate_type  text  NOT NULL,
    aggregate_id    bigint NOT NULL,
    event_type      text  NOT NULL,                -- lab.requested, payment.completed, ...
    payload         jsonb NOT NULL,
    status          text  NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending','processing','sent','failed')),
    attempts        integer NOT NULL DEFAULT 0,
    next_attempt_at timestamptz NOT NULL DEFAULT now(),
    last_error      text,
    created_at      timestamptz NOT NULL DEFAULT now(),
    processed_at    timestamptz
);

-- ---------------------------------------------------------------------
-- 10. INDEX PERFORMA (skenario D6)
-- ---------------------------------------------------------------------
CREATE INDEX ix_visits_date            ON visits (visit_date);
CREATE INDEX ix_visits_poli_date       ON visits (poli_id, visit_date);
CREATE INDEX ix_visits_patient_date    ON visits (patient_id, visit_date DESC);
CREATE INDEX ix_visits_doctor_queue    ON visits (doctor_id, visit_date, status);
CREATE INDEX ix_visit_procedures_visit ON visit_procedures (visit_id) WHERE voided_at IS NULL;
CREATE INDEX ix_prescriptions_visit    ON prescriptions (visit_id);
CREATE INDEX ix_presc_items_presc      ON prescription_items (prescription_id);
CREATE INDEX ix_presc_items_medicine   ON prescription_items (medicine_id);
CREATE INDEX ix_stock_mov_medicine     ON stock_movements (medicine_id, created_at DESC);
CREATE INDEX ix_lab_requests_visit     ON lab_requests (visit_id);
CREATE INDEX ix_lab_requests_status    ON lab_requests (status, created_at);
CREATE INDEX ix_lab_items_request      ON lab_request_items (lab_request_id);
CREATE INDEX ix_invoice_items_invoice  ON invoice_items (invoice_id) WHERE voided_at IS NULL;
CREATE INDEX ix_invoices_status        ON invoices (status, created_at);
CREATE INDEX ix_payments_invoice       ON payments (invoice_id);
CREATE INDEX ix_payments_paid_at       ON payments (paid_at);
CREATE INDEX ix_audit_record           ON audit_logs (table_name, record_id, changed_at DESC);
CREATE INDEX ix_outbox_pending         ON outbox_events (next_attempt_at) WHERE status IN ('pending','failed');

-- ---------------------------------------------------------------------
-- 11. FUNCTION & TRIGGER
-- ---------------------------------------------------------------------

-- updated_at otomatis
CREATE FUNCTION fn_touch_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at := now();
    RETURN NEW;
END $$;

DO $$
DECLARE t text;
BEGIN
    FOREACH t IN ARRAY ARRAY['users','patients','visits','examinations',
                             'prescriptions','lab_requests','invoices']
    LOOP
        EXECUTE format('CREATE TRIGGER trg_touch_%1$s BEFORE UPDATE ON %1$I
                        FOR EACH ROW EXECUTE FUNCTION fn_touch_updated_at()', t);
    END LOOP;
END $$;

-- audit generik (old/new dalam jsonb)
CREATE FUNCTION fn_audit() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
    v_old jsonb;
    v_new jsonb;
    v_id  text;
BEGIN
    IF TG_OP = 'INSERT' THEN
        v_new := to_jsonb(NEW);  v_id := v_new->>'id';
    ELSIF TG_OP = 'UPDATE' THEN
        v_old := to_jsonb(OLD);  v_new := to_jsonb(NEW);  v_id := v_new->>'id';
    ELSE
        v_old := to_jsonb(OLD);  v_id := v_old->>'id';
    END IF;

    INSERT INTO audit_logs (table_name, record_id, action, old_data, new_data, changed_by, reason)
    VALUES (TG_TABLE_NAME, v_id, TG_OP, v_old, v_new,
            NULLIF(current_setting('app.user_id', true), '')::bigint,
            NULLIF(current_setting('app.change_reason', true), ''));
    RETURN NULL;
END $$;

DO $$
DECLARE t text;
BEGIN
    FOREACH t IN ARRAY ARRAY['patients','examinations','examination_diagnoses',
                             'visit_procedures','prescription_items','lab_request_items',
                             'invoices','invoice_items','payments']
    LOOP
        EXECUTE format('CREATE TRIGGER trg_audit_%1$s AFTER INSERT OR UPDATE OR DELETE ON %1$I
                        FOR EACH ROW EXECUTE FUNCTION fn_audit()', t);
    END LOOP;
END $$;

-- hitung ulang total, terbayar (pembayaran - refund), dan status invoice
CREATE FUNCTION fn_recalc_invoice(p_invoice_id bigint) RETURNS void LANGUAGE plpgsql AS $$
DECLARE
    v_total numeric(14,2);
    v_paid  numeric(14,2);
BEGIN
    SELECT COALESCE(SUM(subtotal), 0) INTO v_total
      FROM invoice_items WHERE invoice_id = p_invoice_id AND voided_at IS NULL;
    SELECT COALESCE(SUM(CASE WHEN kind = 'refund' THEN -amount ELSE amount END), 0) INTO v_paid
      FROM payments WHERE invoice_id = p_invoice_id AND status = 'success';

    UPDATE invoices
       SET total_amount = v_total,
           paid_amount  = v_paid,
           status = CASE
                      WHEN v_total > 0 AND v_paid >= v_total THEN 'paid'
                      WHEN v_paid > 0                        THEN 'partial'
                      ELSE 'unpaid'
                    END
     WHERE id = p_invoice_id;
END $$;

CREATE FUNCTION tg_invoice_items_recalc() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        PERFORM fn_recalc_invoice(OLD.invoice_id);
    ELSE
        PERFORM fn_recalc_invoice(NEW.invoice_id);
    END IF;
    RETURN NULL;
END $$;

CREATE TRIGGER trg_invoice_items_recalc
    AFTER INSERT OR UPDATE OR DELETE ON invoice_items
    FOR EACH ROW EXECUTE FUNCTION tg_invoice_items_recalc();

-- kunci baris invoice; pembayaran <= sisa tagihan, refund <= kelebihan bayar
CREATE FUNCTION tg_payment_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
    v_total numeric(14,2);
    v_paid  numeric(14,2);
BEGIN
    SELECT total_amount, paid_amount INTO v_total, v_paid
      FROM invoices WHERE id = NEW.invoice_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Invoice % tidak ditemukan', NEW.invoice_id;
    END IF;
    IF NEW.status = 'success' AND NEW.kind = 'payment' AND NEW.amount > (v_total - v_paid) THEN
        RAISE EXCEPTION 'Pembayaran % melebihi sisa tagihan %', NEW.amount, GREATEST(v_total - v_paid, 0)
            USING ERRCODE = 'check_violation', CONSTRAINT = 'payment_exceeds_balance';
    END IF;
    IF NEW.status = 'success' AND NEW.kind = 'refund' AND NEW.amount > (v_paid - v_total) THEN
        RAISE EXCEPTION 'Refund % melebihi kelebihan bayar %', NEW.amount, GREATEST(v_paid - v_total, 0)
            USING ERRCODE = 'check_violation', CONSTRAINT = 'refund_exceeds_overpaid';
    END IF;
    RETURN NEW;
END $$;

CREATE TRIGGER trg_payment_guard
    BEFORE INSERT ON payments
    FOR EACH ROW EXECUTE FUNCTION tg_payment_guard();

CREATE FUNCTION tg_payment_recalc() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    PERFORM fn_recalc_invoice(NEW.invoice_id);
    RETURN NULL;
END $$;

CREATE TRIGGER trg_payment_recalc
    AFTER INSERT OR UPDATE ON payments
    FOR EACH ROW EXECUTE FUNCTION tg_payment_recalc();

-- ---------------------------------------------------------------------
-- 12. SEED: ROLE & PERMISSION
-- (user admin awal dibuat lewat console command Yii agar hash password benar)
-- ---------------------------------------------------------------------
INSERT INTO roles (code, name) VALUES
    ('admin',        'Administrator'),
    ('registration', 'Petugas Pendaftaran'),
    ('doctor',       'Dokter'),
    ('pharmacy',     'Petugas Farmasi'),
    ('lab',          'Petugas Laboratorium'),
    ('cashier',      'Kasir');

INSERT INTO permissions (code, description) VALUES
    ('user.manage',         'Kelola pengguna & hak akses'),
    ('master.view',         'Lihat master data (poli, dokter, jadwal, tindakan, obat, tes lab)'),
    ('master.manage',       'Kelola master poli, dokter, jadwal, tindakan, tarif, tes lab'),
    ('patient.manage',      'Tambah/ubah data pasien'),
    ('medicine.manage',     'Kelola data obat, stok, dan harga'),
    ('registration.manage', 'Daftarkan kunjungan & kelola antrean'),
    ('queue.view',          'Lihat antrean'),
    ('exam.view',           'Lihat pemeriksaan & rekam medis'),
    ('exam.manage',         'Input/ubah anamnesis, vital sign, diagnosis'),
    ('procedure.manage',    'Tambah/batalkan tindakan medis'),
    ('prescription.view',   'Lihat resep'),
    ('prescription.manage', 'Buat/ubah resep'),
    ('pharmacy.process',    'Proses resep & penyerahan obat'),
    ('lab.request',         'Buat permintaan laboratorium'),
    ('lab.view',            'Lihat permintaan & hasil laboratorium'),
    ('lab.result',          'Input hasil laboratorium'),
    ('billing.view',        'Lihat tagihan & riwayat pembayaran'),
    ('billing.manage',      'Buat/ubah tagihan, cetak invoice'),
    ('payment.create',      'Catat pembayaran'),
    ('report.view',         'Lihat dashboard & laporan');

-- admin: semua permission
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permissions p WHERE r.code = 'admin';

-- role lain: sesuai kewenangan
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM (VALUES
    ('registration','master.view'),
    ('registration','patient.manage'),
    ('registration','registration.manage'),
    ('registration','queue.view'),

    ('doctor','master.view'),
    ('doctor','queue.view'),
    ('doctor','exam.view'),
    ('doctor','exam.manage'),
    ('doctor','procedure.manage'),
    ('doctor','prescription.view'),
    ('doctor','prescription.manage'),
    ('doctor','lab.request'),
    ('doctor','lab.view'),
    ('doctor','billing.view'),

    ('pharmacy','master.view'),
    ('pharmacy','medicine.manage'),
    ('pharmacy','prescription.view'),
    ('pharmacy','pharmacy.process'),

    ('lab','master.view'),
    ('lab','lab.view'),
    ('lab','lab.result'),

    ('cashier','master.view'),
    ('cashier','billing.view'),
    ('cashier','billing.manage'),
    ('cashier','payment.create'),
    ('cashier','report.view')
) AS m(role_code, perm_code)
JOIN roles r       ON r.code = m.role_code
JOIN permissions p ON p.code = m.perm_code;

COMMIT;

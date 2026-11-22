# Dokumentasi API – Backend Yii2

Base URL: `http://localhost:8080`

## Konvensi

- Header `Authorization: Bearer <token>` dari `POST /api/auth/login` (kecuali login & health).
- Body JSON (`Content-Type: application/json`).
- Response sukses: `{ "success": true, "data": ..., "meta": ... }`
- Response gagal: `{ "success": false, "error": { "code": "...", "message": "...", "details": [...] } }`
  (format sama dengan services-node)
- List: `?page=1&limit=20` (maks 100), `meta: {page, limit, total, total_pages}`; pencarian `?q=`; urut `?sort=name` / `?sort=-name`.
- Tanggal `YYYY-MM-DD`, uang dalam rupiah (number).

| HTTP | `error.code` | Arti |
|---|---|---|
| 400 | `BAD_REQUEST` | parameter salah / Idempotency-Key tidak ada |
| 401 | `UNAUTHORIZED`, `INVALID_CREDENTIALS` | token tidak ada/rusak/kedaluwarsa, login salah |
| 403 | `FORBIDDEN`, `ACCOUNT_INACTIVE` | tidak punya permission / bukan pasien dokter tsb. |
| 404 | `NOT_FOUND` | data/route tidak ada |
| 409 | `DUPLICATE_VISIT`, `QUOTA_FULL`, `INSUFFICIENT_STOCK`, `ALREADY_DISPENSED`, `POSSIBLE_DUPLICATE`, `VISIT_CANCELLED`, `INVALID_STATUS`, `HAS_PAYMENT`, ... | konflik dengan kondisi data |
| 422 | `VALIDATION_ERROR` (+ `details[{field,message}]`), `REASON_REQUIRED`, `PAYMENT_EXCEEDS_BALANCE`, `REFUND_EXCEEDS_OVERPAID`, `IDEMPOTENCY_KEY_REUSED`, ... | data tidak valid / aturan bisnis |
| 500 | `INTERNAL_ERROR` | error tak terduga (detail hanya saat YII_DEBUG) |

## Auth

| Method | Path | Permission | Keterangan |
|---|---|---|---|
| POST | `/api/auth/login` | publik | `{username, password}` → `{token, token_type, expires_at, user{role, permissions, medical_staff_id}}` |
| GET | `/api/auth/me` | login | profil + permission |
| POST | `/api/auth/change-password` | login | `{current_password, new_password}` |
| GET | `/api/health` | publik | status DB |

## Master data (CRUD)

Semua mendukung `GET /api/{res}`, `GET /api/{res}/{id}`, `POST /api/{res}`, `PUT /api/{res}/{id}`, `DELETE /api/{res}/{id}`.
DELETE = nonaktifkan (soft delete), riwayat transaksi tetap utuh.

| Resource | Lihat | Kelola | Field | Filter / catatan |
|---|---|---|---|---|
| `polis` | master.view | master.manage | code, name, registration_fee, is_active | `q`, `is_active` |
| `medical-staff` | master.view | master.manage | staff_type (doctor/nurse/pharmacist/lab_analyst), name, str_no, specialization, phone, user_id | `staff_type`; str_no unik |
| `doctor-schedules` | master.view | master.manage | doctor_id, poli_id, day_of_week (1=Senin), start_time, end_time, quota | `doctor_id`, `poli_id`, `day_of_week`; tolak jadwal bentrok |
| `patients` | master.view | patient.manage | nik, name, birth_date, gender (L/P), address, phone | `q` = no. RM / NIK / nama; no. RM otomatis; NIK unik 16 digit; nama+tgl lahir sama → 409 `POSSIBLE_DUPLICATE` kecuali `confirm_new: true` |
| `procedures` | master.view | master.manage | code, name, price | |
| `medicines` | master.view | medicine.manage | code, name, unit, price, min_stock, `stock` (hanya saat create) | `low_stock=1`; stok tidak bisa diubah lewat PUT |
| `lab-tests` | master.view | master.manage | code, name, price, unit, ref_range | |
| `users` | user.manage | user.manage | username, full_name, email, password, role / role_id, is_active | tidak bisa menonaktifkan diri sendiri |

Tambahan:

| Method | Path | Permission | Keterangan |
|---|---|---|---|
| GET | `/api/users/roles` | user.manage | role + daftar permission |
| GET | `/api/doctor-schedules/available?date=&poli_id=` | registration.manage / queue.view | dokter praktik pada tanggal tsb + `quota`, `used`, `remaining` |
| POST | `/api/medicines/{id}/stock` | medicine.manage | `{type: in\|adjustment, quantity, note}` (adjustment wajib note, boleh negatif) |
| GET | `/api/medicines/{id}/movements` | medicine.manage / report.view | kartu stok |

## Pendaftaran & antrean

| Method | Path | Permission | Keterangan |
|---|---|---|---|
| GET | `/api/visits?date=&poli_id=&doctor_id=&status=&q=` | queue.view / exam.view / billing.view | default hari ini; `meta.status_count` |
| POST | `/api/visits` | registration.manage | `{patient_id, schedule_id, visit_date?, notes?}` → nomor antrean otomatis (`queue_code` mis. `UMUM-003`), invoice + biaya pendaftaran dibuat |
| GET | `/api/visits/{id}` | beberapa | detail + pemeriksaan + ringkasan invoice |
| POST | `/api/visits/{id}/cancel` | registration.manage | `{reason}`; hanya status `waiting` & belum ada pembayaran |
| POST | `/api/visits/{id}/call` | exam.manage | dokter memanggil pasien (`waiting` → `in_exam`) |
| GET | `/api/patients/{id}/visits` | queue.view / exam.view / billing.view | riwayat kunjungan |

Status kunjungan: `waiting` → `in_exam` → `exam_done` → `completed` (otomatis saat lunas), atau `cancelled`.

## Pemeriksaan & rekam medis

| Method | Path | Permission | Keterangan |
|---|---|---|---|
| GET | `/api/examinations/queue?date=&status=` | exam.view | pasien milik dokter yang login (admin: semua) |
| GET | `/api/visits/{id}/examination` | exam.view | |
| PUT | `/api/visits/{id}/examination` | exam.manage | `{anamnesis, chief_complaint, bp_systolic, bp_diastolic, heart_rate, resp_rate, temperature, spo2, weight_kg, height_cm, physical_exam, diagnoses: [{icd10_code, diagnosis_name, diagnosis_type: primary\|secondary}], reason?}`; setelah final **`reason` wajib** |
| POST | `/api/visits/{id}/examination/finalize` | exam.manage | wajib tepat 1 diagnosis utama |
| GET | `/api/visits/{id}/examination/history` | exam.view | jejak audit (old/new, oleh siapa, alasan) |
| GET | `/api/patients/{id}/medical-records` | exam.view | per kunjungan: pemeriksaan, diagnosis, tindakan, obat, hasil lab |

Dokter hanya bisa mengubah data pasien yang terdaftar padanya (selain admin).

## Tindakan medis

| Method | Path | Permission | Keterangan |
|---|---|---|---|
| GET | `/api/visits/{id}/procedures?include_voided=1` | exam.view / billing.view | `meta.total` |
| POST | `/api/visits/{id}/procedures` | procedure.manage | `{procedure_id, quantity?, notes?}` → tarif disalin (snapshot) & masuk tagihan |
| DELETE | `/api/visits/{id}/procedures/{pid}` | procedure.manage | `{reason}` → void + baris tagihan di-void, revisi tagihan naik |

## Resep & farmasi

| Method | Path | Permission | Keterangan |
|---|---|---|---|
| POST | `/api/visits/{id}/prescriptions` | prescription.manage | `{notes?, items: [{medicine_id, dose, frequency, quantity, instructions?}]}`; cek stok tersedia (stok − resep pending lain) |
| GET | `/api/visits/{id}/prescriptions` | prescription.view / exam.view | |
| GET | `/api/prescriptions?status=pending&date=` | prescription.view | antrean farmasi |
| GET | `/api/prescriptions/{id}` | prescription.view | |
| POST | `/api/prescriptions/{id}/dispense` | pharmacy.process | serahkan obat: stok berkurang atomik, masuk tagihan; semua item atau tidak sama sekali |
| POST | `/api/prescriptions/{id}/cancel` | prescription.manage / pharmacy.process | `{reason}`; hanya yang belum diserahkan |
| GET | `/api/patients/{id}/medications` | prescription.view / exam.view | riwayat penggunaan obat |

## Laboratorium

| Method | Path | Permission | Keterangan |
|---|---|---|---|
| POST | `/api/visits/{id}/lab-requests` | lab.request | `{test_ids: [..], notes?}` → item + tagihan + event `lab.requested` (outbox) |
| GET | `/api/visits/{id}/lab-requests` | lab.view / exam.view | termasuk hasil |
| POST | `/api/lab-requests/{id}/cancel` | lab.request | `{reason}`; hanya yang belum diproses |
| PUT | `/internal/lab-items/{id}/result` | header `X-Service-Token` + `Idempotency-Key` | **khusus services-node**. `{result_value, result_unit?, result_flag?, result_notes?, resulted_by}`; kunci sama → respons lama (`meta.replayed: true`); kunci sama data beda → 422 |

Worklist & input hasil untuk petugas lab: services-node `/api/v1/lab/*` (lihat `services-node/docs/API.md`).

## Billing & pembayaran

| Method | Path | Permission | Keterangan |
|---|---|---|---|
| GET | `/api/invoices?status=&from=&to=&q=` | billing.view | |
| GET | `/api/invoices/{id}` | billing.view | `summary{registration, procedure, lab, medicine}`, `items` (termasuk yang di-void + alasan), `payments`, `balance`, `overpaid_amount`, `revision` |
| GET | `/api/visits/{id}/invoice` | billing.view | sama, berdasarkan kunjungan |
| POST | `/api/invoices/{id}/payments` | payment.create | header **`Idempotency-Key`** wajib; `{amount, method: cash\|non_cash, channel?: qris\|debit\|credit\|transfer, reference_no?}`; 201 baru, 200 + `meta.replayed: true` bila kunci sama dikirim ulang |
| POST | `/api/invoices/{id}/refunds` | payment.create | header `Idempotency-Key`; `{amount, method, channel?, reason}`; maksimal sebesar kelebihan bayar |
| GET | `/api/patients/{id}/payments` | billing.view | riwayat pembayaran pasien |
| GET | `/api/invoices/{id}/print` | billing.view | invoice HTML siap cetak / simpan PDF |
| GET | `/api/payments/{id}/receipt` | billing.view | bukti pembayaran / refund HTML |

Status invoice dihitung database: `unpaid` → `partial` → `paid`. Non-tunai adalah simulasi (nomor referensi `SIM-...`).

Frontend membuat `Idempotency-Key` **sekali saat form bayar dibuka** (mis. `crypto.randomUUID()`) dan memakainya
lagi untuk setiap percobaan ulang.

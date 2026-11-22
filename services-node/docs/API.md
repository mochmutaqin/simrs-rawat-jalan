# Dokumentasi API – Node.js Services

Base URL: `http://localhost:3001`

Kolom bertipe tanggal (`visit_date`, `birth_date`, `date`, dst.) dikirim sebagai string `YYYY-MM-DD` apa adanya, tidak dikonversi ke zona waktu.

## Konvensi

**Autentikasi**
- Endpoint `/api/v1/*` (kecuali integrasi): header `Authorization: Bearer <JWT>`. JWT diterbitkan Yii (`POST /api/auth/login`), HS256, dengan secret yang sama (`JWT_SECRET`).
- Endpoint `/api/v1/integration/*`: header `X-Service-Token: <SERVICE_TOKEN>`.

**Format response**

```json
// sukses
{ "success": true, "data": { }, "meta": { } }

// gagal
{ "success": false, "error": { "code": "BAD_REQUEST", "message": "Validasi request gagal",
  "details": [ { "field": "status", "message": "Invalid option" } ] } }
```

| HTTP | `error.code` | Kapan |
|---|---|---|
| 400 | `BAD_REQUEST` | Validasi params/query/body gagal, JSON rusak |
| 401 | `UNAUTHORIZED` | Token tidak ada, rusak, kedaluwarsa, atau service token salah |
| 403 | `FORBIDDEN` | Permission di JWT tidak cukup |
| 404 | `NOT_FOUND` | Data atau route tidak ada |
| 4xx | dari Yii | Penolakan bisnis oleh Yii diteruskan apa adanya |
| 503 | `UPSTREAM_UNAVAILABLE` | Yii tidak bisa dihubungi setelah retry |
| 503 | `QUERY_TIMEOUT` | Query melebihi `statement_timeout` |
| 500 | `INTERNAL_ERROR` | Error tak terduga (detail hanya di log server) |

**Paginasi**: `?page=1&limit=20` (limit maks 100). `meta` berisi `page, limit, total, total_pages`.

**Periode**: `?from=YYYY-MM-DD&to=YYYY-MM-DD`. Default 30 hari terakhir (tanggal lokal server), maksimal 366 hari.

---

## Umum

### `GET /health`
Tanpa auth. `200` bila DB terhubung, `503` bila tidak.
```json
{ "success": true, "data": { "status": "ok", "database": "up" } }
```

### `GET /api/v1/me`
Isi JWT yang sedang dipakai.
```json
{ "success": true, "data": { "id": 7, "username": "lab01", "role": "lab", "perms": ["lab.view","lab.result"] } }
```

---

## Laboratorium

### `GET /api/v1/lab/requests`  · permission `lab.view`
Daftar permintaan lab untuk petugas laboratorium.

| Query | Tipe | Keterangan |
|---|---|---|
| `status` | `requested \| in_progress \| completed \| cancelled` | opsional |
| `from`, `to` | `YYYY-MM-DD` | filter tanggal permintaan, opsional |
| `page`, `limit` | int | paginasi |

```json
{ "success": true,
  "data": [ { "id": 1, "status": "requested", "created_at": "2026-11-22T03:10:00.000Z", "visit_id": 1,
              "medical_record_no": "RM-000001", "patient_name": "Ani", "requested_by": "dr. Satu",
              "poli": "Poli Umum", "item_count": 2, "resulted_count": 0 } ],
  "meta": { "page": 1, "limit": 20, "total": 1, "total_pages": 1 } }
```

### `GET /api/v1/lab/requests/:id`  · `lab.view`
Header permintaan + item pemeriksaan (tes, nilai rujukan default, hasil bila sudah ada). `404` bila tidak ada.

### `GET /api/v1/lab/visits/:id/results`  · `lab.view`
Semua hasil lab satu kunjungan. Dipakai dokter saat membuka riwayat kunjungan pasien.

### `POST /api/v1/lab/items/:id/result`  · `lab.result`
Input hasil satu item pemeriksaan. **Node tidak menulis ke DB**: request divalidasi, lalu diteruskan ke Yii.

Header opsional: `Idempotency-Key: <uuid>`. Kirim kunci yang sama saat mengulang request dari klien. Kalau tidak dikirim, Node membuat satu dan memakainya untuk semua retry internal.

Body (field lain ditolak):
```json
{ "result_value": "13.5", "result_unit": "g/dL", "result_flag": "normal", "result_notes": "opsional" }
```
`result_flag`: `normal | high | low | abnormal`.

Respons `200`:
```json
{ "success": true, "data": { "id": 1, "saved": true }, "meta": { "idempotency_key": "abc-123" } }
```

Alur kegagalan:
- Yii error 5xx / timeout / koneksi putus → retry otomatis (default 2x, backoff 200 ms → 400 ms) dengan **kunci idempotensi yang sama**.
- Tetap gagal → `503 UPSTREAM_UNAVAILABLE` dengan `details.attempts`. Klien tahu data **belum** tersimpan dan aman mengulang.
- Yii menolak (4xx, mis. hasil sudah final) → diteruskan apa adanya, tanpa retry.

---

## Dashboard  · semua butuh `report.view`

Semua menerima `from` dan `to`, dan mengembalikan `meta.from`, `meta.to`.
Sumber tanggal: kunjungan & tindakan = `visits.visit_date`; pendapatan = `payments.paid_at`; obat = waktu mutasi stok `dispense`. Kunjungan berstatus `cancelled` dan item yang di-void tidak dihitung.

### `GET /api/v1/dashboard/summary`
```json
{ "success": true,
  "data": { "total_visits": 3, "total_procedures": 3,
            "revenue_received": 60000, "revenue_invoiced": 110000,
            "medicine_units_dispensed": 10,
            "visits_by_poli": [ { "poli_id": 1, "poli": "Poli Umum", "visits": 2 } ],
            "payment_status": [ { "status": "paid", "invoices": 1, "total_amount": 50000, "paid_amount": 50000 } ] },
  "meta": { "from": "2026-11-22", "to": "2026-11-22" } }
```
`revenue_received` = uang masuk pada periode. `revenue_invoiced` = total tagihan kunjungan pada periode.

| Endpoint | Isi |
|---|---|
| `GET /api/v1/dashboard/visits-by-poli` | Jumlah kunjungan per poli |
| `GET /api/v1/dashboard/procedures` | Per tindakan: `total_qty`, `total_amount` |
| `GET /api/v1/dashboard/revenue` | Per hari: `payments`, `amount`, `cash`, `non_cash` |
| `GET /api/v1/dashboard/medicine-usage` | Per obat: `total_qty` keluar, `current_stock` |
| `GET /api/v1/dashboard/payment-status` | Per status invoice: jumlah, total tagihan, total terbayar |

### `GET /api/v1/dashboard/details/visits`
Rincian (drill-down) kunjungan, berpaginasi.

| Query | Keterangan |
|---|---|
| `from`, `to` | periode |
| `poli_id` | opsional |
| `payment_status` | `unpaid \| partial \| paid`, opsional |
| `page`, `limit` | paginasi |

Setiap baris: kunjungan, pasien, poli, dokter, nomor invoice, status bayar, total, terbayar.

---

## Laporan

Semua laporan read-only, menerima `from` dan `to` (default 30 hari terakhir), dan mengembalikan:

```json
{ "success": true,
  "data": { "summary": { }, "rows": [ ] },
  "meta": { "from": "2026-10-24", "to": "2026-11-22", "page": 1, "limit": 20, "total": 6, "total_pages": 1 } }
```

| Query umum | Keterangan |
|---|---|
| `page`, `limit` | paginasi; `limit` maksimal **1000** (untuk cetak satu dokumen) |
| `format` | `json` (default) atau `csv`: seluruh baris (maks. 10.000) sebagai file CSV untuk Excel, pemisah `;`, BOM UTF-8, header `Content-Disposition: attachment; filename="laporan-…_{from}_{to}.csv"` |

### `GET /api/v1/reports/patients`  · `report.view`
Laporan data pasien.

| Query | Keterangan |
|---|---|
| `basis` | `registered` (default): pasien yang terdaftar pada periode; `visited`: pasien yang berkunjung pada periode |
| `gender` | `L \| P`, opsional |
| `q` | cari nama, No. RM, atau NIK |

`summary`: `total_patients, male, female, age_child (<18), age_adult (18–59), age_elderly (60+), total_visits`.
Setiap baris: `medical_record_no, nik, name, gender, birth_date, age, phone, address, registered_at, visits_in_period, last_visit`.
Kunjungan yang dibatalkan tidak dihitung.

### `GET /api/v1/reports/medicine-stock`  · `report.view` atau `medicine.manage`
Laporan stok obat (obat aktif). Mutasi diambil dari buku stok (`stock_movements`).

| Query | Keterangan |
|---|---|
| `status` | `ok` (aman), `low` (stok ≤ stok minimum), `out` (habis), opsional |
| `q` | cari kode atau nama obat |

Setiap baris: `stock_start` (stok awal periode), `qty_in`, `qty_out`, `qty_adjust` (penyesuaian + retur), `stock_end` (stok akhir periode),
`stock` (stok saat ini), `min_stock`, `status`, `price`, `stock_value`. Stok awal/akhir dihitung mundur dari stok saat ini dikurangi mutasi
sesudah tanggal tersebut. Baris diurutkan yang perlu tindakan dulu: habis, menipis, aman.
`summary`: `total_items, total_units, stock_value, status_ok, status_low, status_out, total_in, total_out`.

### `GET /api/v1/reports/prescriptions`  · `report.view`
Laporan jumlah resep berdasarkan tanggal resep dibuat.

| Query | Keterangan |
|---|---|
| `status` | `pending \| dispensed \| cancelled`, opsional |
| `poli_id`, `doctor_id` | opsional |

Setiap baris: resep, pasien, poli, dokter, `item_count`, `total_qty`, `total_amount`, `status`, `dispensed_at`. Item resep yang di-void tidak dihitung.
`summary`: `total_prescriptions, pending, dispensed, cancelled, total_qty` (tanpa resep batal), `dispensed_amount`,
`by_doctor` (jumlah resep per dokter/poli), `top_medicines` (10 obat paling banyak diresepkan).

---

## Integrasi

### `POST /api/v1/integration/events`  · `X-Service-Token`
Penerima event dari outbox Yii. Pengiriman bersifat *at-least-once*, jadi endpoint ini idempoten berdasarkan `id`.

```json
{ "id": "evt-1", "type": "lab.requested", "payload": { "lab_request_id": 1 } }
```
`type`: `lab.requested | payment.completed`.

Respons `202`, termasuk untuk duplikat (bagi pengirim artinya sudah sukses dan event boleh ditandai `sent`):
```json
{ "success": true, "data": { "accepted": true, "duplicate": false } }
```

Batasan saat ini: daftar event yang sudah diterima disimpan di memori (Node tidak punya izin tulis DB). Efek event hanya log/notifikasi dan idempoten, jadi restart service tidak menyebabkan data ganda.

---

## Kontrak yang harus disediakan Yii

Node memanggil endpoint ini. Implementasinya ada di backend Yii (Fase 2).

### `PUT {YII_BASE_URL}/internal/lab-items/{id}/result`
Header: `X-Service-Token`, `Idempotency-Key`, `Content-Type: application/json`

```json
{ "result_value": "13.5", "result_unit": "g/dL", "result_flag": "normal",
  "result_notes": null, "resulted_by": 7 }
```

Yii wajib:
1. Tolak bila service token salah (`401`).
2. Simpan `Idempotency-Key`. Kunci yang sama → kembalikan hasil sebelumnya, jangan simpan ulang.
3. Validasi aturan bisnis (item ada, belum di-void, permintaan tidak dibatalkan). Gagal → `4xx` dengan format error yang sama.
4. Simpan hasil + audit dalam satu transaksi. Bila semua item sudah ada hasil, ubah status permintaan jadi `completed`.
5. Sukses → `200 { "success": true, "data": { "id": 1, "saved": true } }`.

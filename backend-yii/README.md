# SIMRS Rawat Jalan – Backend Utama (Yii2)

Seluruh business logic dan **semua penulisan data** SIMRS ada di sini: master data, pendaftaran & antrean,
pemeriksaan/rekam medis, tindakan, resep & farmasi, permintaan lab, billing, pembayaran, user & hak akses.
services-node hanya membaca database (read-only) dan meneruskan input hasil lab ke endpoint internal Yii.

## Struktur

```
backend-yii/
├── components/        infrastruktur API
│   ├── ApiErrorHandler.php   semua error -> {success:false, error:{code,message,details}}; constraint DB -> 409/422
│   ├── ApiException.php      error dengan kode mesin-readable
│   ├── Jwt.php, JwtAuth.php  JWT HS256 (secret sama dengan services-node)
│   ├── PermissionFilter.php  RBAC per action, deny by default
│   ├── ServiceTokenAuth.php  untuk /internal/* (dipanggil services-node)
│   └── Tx.php                transaksi + konteks audit (app.user_id, app.change_reason)
├── controllers/api/   controller tipis: validasi input ringan, panggil service, bentuk response
├── services/          business logic transaksional (Registration, Examination, Procedure,
│                      Prescription, Stock, Lab, Billing, Payment, Idempotency, Outbox, Seed)
├── models/            ActiveRecord + aturan validasi
├── views/print/       invoice & bukti pembayaran HTML siap cetak / simpan PDF
├── commands/          php yii seed/*, php yii outbox/*
├── migrations/        memasang ../database/001_schema.sql
├── config/            web, console, test, routes.php (tabel seluruh endpoint), env loader
└── tests/             Unit (JWT) + Api (integration test HTTP, termasuk uji konkurensi)
```

## Instalasi

Prasyarat: PHP ≥ 8.2 dengan ekstensi `pdo_pgsql`, Composer, PostgreSQL 14+ (atau `docker compose up -d` dari root repo).

```bash
cd backend-yii
composer install
cp .env.example .env          # sesuaikan koneksi DB & JWT_SECRET (harus sama dengan services-node)
php yii migrate               # memasang skema (dilewati bila sudah dipasang docker-compose)
php yii seed/demo             # data dummy + akun demo
php yii serve 0.0.0.0:8080    # atau arahkan web server ke folder web/
```

Windows/XAMPP: aktifkan `extension=pdo_pgsql` dan `extension=pgsql` di `php.ini`.

Akun demo (password `password123`):

| Username | Role |
|---|---|
| admin | Administrator |
| pendaftaran | Petugas Pendaftaran |
| dokter.umum, dokter.gigi, dokter.anak | Dokter (masing-masing poli) |
| farmasi | Petugas Farmasi |
| lab | Petugas Laboratorium |
| kasir | Kasir |

Worker pengiriman event ke services-node (jalankan terpisah):

```bash
php yii outbox/run            # terus-menerus
php yii outbox/run --once     # sekali (cron / Task Scheduler)
php yii outbox/status
```

## Tes

Tes integrasi memakai database **simrs_test** (dibuat otomatis, dikosongkan setiap kali dijalankan)
dan menyalakan server PHP sendiri di port 8089.

```bash
vendor/bin/codecept run          # semua suite
vendor/bin/codecept run Unit     # JWT
vendor/bin/codecept run Api      # alur pelayanan, RBAC, master data, skenario D1-D5
```

Hasil terakhir: **43 tes, 312 assertion, semua lolos** (Linux, PHP 8.3, PostgreSQL 16).

| File | Isi |
|---|---|
| `Api/ServiceFlowTest` | alur lengkap pendaftaran → periksa → tindakan → resep/farmasi → lab → billing → bayar bertahap → lunas, cetak invoice & struk |
| `Api/ConcurrencyTest` | request **paralel sungguhan**: 10 pendaftaran pasien sama → 1 berhasil; 12 pendaftaran → nomor antrean unik berurutan; 2 resep berebut stok terakhir → stok tidak minus; resep sama diproses 5x → obat keluar sekali; pembayaran di-retry 6x bersamaan → tercatat 1x; 2 kasir melunasi bersamaan → tidak melebihi tagihan |
| `Api/ChangeAfterBillingTest` | ubah diagnosis setelah final wajib alasan + audit trail; batal tindakan setelah lunas → revisi tagihan + refund; tambah tindakan setelah bayar → status kembali "sebagian" |
| `Api/IntegrationTest` | endpoint internal hasil lab idempoten; outbox tetap menyimpan & menjadwalkan ulang event saat services-node mati |
| `Api/AccessControlTest` | 8 kombinasi role × fitur terlarang → 403; dokter tidak bisa memeriksa pasien dokter lain |
| `Api/AuthTest`, `Api/MasterDataTest` | login, token, akun nonaktif; validasi, anti duplikasi, soft delete, stok lewat ledger |

Catatan Windows: server bawaan PHP di Windows hanya 1 worker, jadi request "paralel" di `ConcurrencyTest` diproses berurutan
(tes tetap lulus, tetapi tidak membuktikan race). Bukti konkurensi dijalankan di Linux; bukti level database ada di
`../database/002_constraint_tests.sql`.

## Dokumentasi endpoint

Lihat [`docs/API.md`](docs/API.md). Seluruh route juga terlihat di [`config/routes.php`](config/routes.php).

# SIMRS Rawat Jalan – Frontend (React)

Aplikasi petugas: pendaftaran & antrean, pemeriksaan dokter, farmasi, laboratorium, kasir, dashboard,
dan master data. Menu dan halaman menyesuaikan permission user (RBAC yang sama dengan backend).

Stack: React 18 · Vite 5 · React Router 6 · Tailwind CSS 3 · Recharts · font Atkinson Hyperlegible Next (lokal, tanpa CDN).

## Menjalankan

```bash
cd frontend
npm install
npm run dev            # http://localhost:5173
```

Backend Yii (:8080) dan services-node (:3001) harus menyala. Dev server mem-proxy:

| Path di frontend | Diteruskan ke |
|---|---|
| `/api/*` | backend Yii `http://localhost:8080/api/*` |
| `/node/*` | services-node `http://localhost:3001/*` (prefix `/node` dibuang) |

Jadi tidak perlu konfigurasi CORS saat development. Target bisa diubah lewat `YII_URL` / `NODE_URL` (lihat `.env.example`).

Build produksi: `npm run build` → folder `dist/`, sajikan di web server yang juga mem-proxy `/api` dan `/node`
(atau set `CORS_ORIGINS` di Yii & services-node bila dipanggil langsung).

## Struktur

```
src/
├── api/client.js          klien Yii & Node, format error seragam, Idempotency-Key
├── auth/AuthContext.jsx   login JWT, can(permission), logout otomatis saat 401
├── components/            Layout (menu per unit + RBAC), ui (tombol, form, modal, tiket antrean, toast), form & pencarian pasien
├── lib/                   format rupiah/tanggal (Asia/Jakarta), hook data, cetak dokumen, daftar ICD-10
└── pages/
    ├── Registration.jsx   antrean per tanggal/poli/status, pendaftaran (pasien lama/baru, cek duplikat, pilih jadwal)
    ├── Patients.jsx       data pasien, riwayat kunjungan, rekam medis, riwayat obat & pembayaran
    ├── DoctorQueue.jsx    antrean dokter, panggil pasien
    ├── Examination.jsx    anamnesis, vital sign, diagnosis ICD-10, tindakan, resep, permintaan lab, finalisasi, jejak perubahan
    ├── Pharmacy.jsx       resep masuk & penyerahan obat, stok, mutasi, kartu stok
    ├── Lab.jsx            worklist & input hasil (lewat services-node)
    ├── Billing.jsx        tagihan, bayar bertahap tunai/non-tunai, refund, cetak invoice & bukti bayar
    ├── Dashboard.jsx      ringkasan, pendapatan, kunjungan per poli, tindakan, obat, status bayar, rincian (services-node)
    └── MasterData.jsx     CRUD poli, tenaga medis, jadwal, tindakan, tes lab, pengguna
```

## Keputusan desain

- **Warna penunjuk arah per unit** (seperti papan wayfinding rumah sakit): Pendaftaran teal, Pemeriksaan biru,
  Farmasi hijau, Laboratorium ungu, Kasir amber. Muncul di menu dan judul halaman.
- **Nomor antrean bergaya tiket** sebagai elemen paling menonjol; sisanya tabel & form yang tenang.
- **Status selalu label + warna** (tidak mengandalkan warna saja). Palet grafik divalidasi buta warna & kontras,
  dan sengaja tidak memakai warna status.
- **Idempotency-Key dibuat sekali saat form bayar / input hasil lab dibuka**, dipakai ulang saat retry, sehingga
  klik ulang setelah gangguan jaringan tidak mencatat transaksi ganda.
- Halaman dokter, farmasi, lab, dan antrean memuat ulang otomatis tiap 20 detik.

## Uji end-to-end & screenshot

`scripts/e2e-flow.mjs` menjalankan alur lengkap di browser (pendaftaran → dokter → lab → farmasi → kasir →
cetak → dashboard → cek RBAC) dan menyimpan screenshot ke `../docs/screenshots`.

```bash
npm i -D playwright && npx playwright install chromium
npm run e2e
```

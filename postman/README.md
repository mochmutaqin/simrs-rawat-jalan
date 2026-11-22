# Pengujian API dengan Postman

| File | Isi |
|---|---|
| `SIMRS.postman_collection.json` | 102 request (backend Yii + services-node) dalam 11 folder, 286 assertion |
| `SIMRS-lokal.postman_environment.json` | `yii_url`, `node_url`, `service_token` untuk instalasi lokal |
| `reports/ringkasan-pengujian.html` | ringkasan hasil run terakhir (bisa dibuka offline) |
| `reports/newman-report.html` | laporan detail Newman htmlextra (butuh internet untuk tampilan) |
| `reports/newman-junit.xml` | hasil dalam format JUnit (untuk CI) |

Hasil run terakhir: **102 request, 286/286 assertion lolos**, diulang dua kali di atas data yang sama dan tetap lolos.

## Menjalankan

Prasyarat: backend Yii (:8080) dan services-node (:3001) menyala, data demo sudah di-seed (`php yii seed/demo`).

**Postman app:** Import kedua file JSON → pilih environment *SIMRS Lokal* → klik kanan collection → **Run collection**.
Jalankan berurutan (folder 00 sampai 10). Token login dan ID yang dibuat otomatis disimpan ke collection variable
untuk request berikutnya. Data dibuat unik setiap run, jadi collection bisa diulang tanpa reset database.

**Command line (Newman):**

```bash
npx newman run postman/SIMRS.postman_collection.json -e postman/SIMRS-lokal.postman_environment.json
```

## Cakupan

| Folder | Yang diuji |
|---|---|
| 00 Kesehatan service | health Yii & Node, koneksi database |
| 01 Autentikasi | login 7 akun, password salah, validasi, token rusak/tidak ada, permission per role |
| 02 Master data | CRUD poli, kode duplikat ditolak, soft delete, lookup tindakan/obat/tes lab, mutasi stok via ledger |
| 03 Pasien & pendaftaran | pasien baru (no. RM otomatis), validasi, deteksi pasien kembar, jadwal & kuota, nomor antrean, **pendaftaran ganda ditolak (D1)**, tagihan otomatis, pembatalan wajib alasan |
| 04 Pemeriksaan dokter | RBAC (kasir & dokter lain ditolak), panggil pasien, validasi vital sign, diagnosis utama/sekunder, tindakan, resep (cek stok), permintaan lab, finalisasi, **ubah diagnosis setelah final wajib alasan + audit trail (D4)** |
| 05 Laboratorium (Node) | worklist & detail dari Node, input hasil Node → Yii dengan Idempotency-Key, **retry kunci sama = replay, kunci sama data beda = 422 (D5)**, endpoint internal wajib service token |
| 06 Farmasi | resep menunggu, penyerahan obat, **penyerahan ganda ditolak (D2)**, riwayat obat & rekam medis lengkap |
| 07 Billing & pembayaran | rincian 4 komponen biaya, bayar bertahap tunai/QRIS, **retry pembayaran tidak tercatat ganda (D3)**, bayar melebihi sisa ditolak, status otomatis lunas, cetak invoice & bukti bayar |
| 08 Koreksi setelah lunas (D4) | batal tindakan wajib alasan, tagihan direvisi, kelebihan bayar, refund dibatasi |
| 09 Dashboard (Node) | ringkasan, pendapatan, per poli, tindakan, obat, status bayar, rincian, validasi periode, RBAC |
| 10 Integrasi & format error | event outbox (service token, idempoten), format 404 seragam di Yii & Node |

Uji konkurensi sungguhan (request paralel) ada di `backend-yii/tests/Api/ConcurrencyTest.php`, karena Postman Runner
mengirim request secara berurutan.

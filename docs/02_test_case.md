# Test Case Fitur Utama

Semua test case di bawah dijalankan otomatis, tidak dicek manual satu per satu. Kolom **Bukti** menunjuk test yang membuktikannya:

- **Yii**: Codeception di `backend-yii/tests/` (nama class `::` nama method)
- **Node**: `services-node/test/api.test.js` (judul test)
- **Postman**: folder dan nama request di `postman/SIMRS.postman_collection.json`, dijalankan dengan Newman
- **E2E**: `frontend/scripts/e2e-flow.mjs` (Playwright, browser sungguhan)

## Ringkasan hasil

| Bagian | Perintah | Jumlah | Hasil |
|---|---|---|---|
| Backend Yii (unit + integrasi HTTP) | `cd backend-yii && vendor/bin/codecept run` | 43 test, 312 assertion | Lulus |
| services-node | `cd services-node && npm test` | 19 test | Lulus |
| Postman / Newman | `npx newman run postman/SIMRS.postman_collection.json -e postman/SIMRS-lokal.postman_environment.json` | 102 request, 286 assertion | Lulus ([laporan](../postman/reports/ringkasan-pengujian.html)) |
| E2E browser | `cd frontend && npm run e2e` | alur lengkap semua role | Lulus, tanpa error console / HTTP 5xx |
| Constraint database | `psql -d simrs -f database/002_constraint_tests.sql` | semua pelanggaran | Ditolak database |

## A. Autentikasi dan hak akses

| ID | Skenario | Hasil yang diharapkan | Bukti | Status |
|---|---|---|---|---|
| TC-01 | Login dengan username dan password benar | 200, JWT berisi `role` dan `perms` | Yii `AuthTest::testLoginReturnsTokenWithRoleAndPermissions`; Postman 01 "Login admin" s.d. "Login kasir" | Lulus |
| TC-02 | Login password salah / user tidak ada | 401 dengan pesan yang sama (tidak membocorkan user mana yang ada) | Yii `AuthTest::testWrongPasswordAndUnknownUserGiveSameError`; Postman 01 "Login gagal" | Lulus |
| TC-03 | Login dengan field kosong | 422 dengan detail per field | Yii `AuthTest::testLoginValidation`; Postman 01 "Login validasi" | Lulus |
| TC-04 | Akses endpoint tanpa token, token rusak, token kedaluwarsa | 401 | Yii `AuthTest::testProtectedEndpointWithoutOrWithBadToken`, `JwtTest`; Node "tanpa token -> 401…" | Lulus |
| TC-05 | Token dimanipulasi, secret salah, `alg=none` | Ditolak | Yii `JwtTest::testTamperedPayloadIsRejected`, `testWrongSecretIsRejected`, `testAlgNoneIsRejected` | Lulus |
| TC-06 | User dinonaktifkan memakai token lama | Login ditolak, token lama tidak berlaku | Yii `AuthTest::testDeactivatedUserCannotLoginOrUseOldToken` | Lulus |
| TC-07 | Role memakai fitur role lain (8 kombinasi, mis. kasir membuat resep, lab mencatat pembayaran) | 403 dengan nama permission yang kurang | Yii `AccessControlTest::testRoleCannotUseForeignFeature`; Postman 04 "Kasir buat resep -> 403" | Lulus |
| TC-08 | Dokter membuka pasien dokter lain | 403; antrean hanya berisi pasiennya sendiri | Yii `AccessControlTest::testDoctorCannotTreatAnotherDoctorsPatient`, `testDoctorQueueOnlyShowsOwnPatients` | Lulus |
| TC-09 | Endpoint internal Yii dipanggil tanpa service token | 401 | Yii `AccessControlTest::testInternalEndpointRequiresServiceToken`; Postman 05 "Yii internal tanpa service token" | Lulus |

## B. Master data dan pasien

| ID | Skenario | Hasil yang diharapkan | Bukti | Status |
|---|---|---|---|---|
| TC-10 | CRUD poli, kode duplikat, nonaktifkan | Tersimpan; kode sama 422; nonaktif = soft delete | Yii `MasterDataTest::testPoliCrudWithValidationAndDuplicatePrevention`; Postman 02 | Lulus |
| TC-11 | Tambah pasien baru | Nomor RM otomatis; NIK divalidasi 16 digit dan unik | Yii `MasterDataTest::testPatientGetsMedicalRecordNumberAndNikIsValidated`; Postman 03 "Tambah pasien baru" | Lulus |
| TC-12 | Pasien tanpa NIK dengan nama + tanggal lahir sama | 409 `POSSIBLE_DUPLICATE`, tersimpan hanya bila petugas konfirmasi | Yii `MasterDataTest::testPossibleDuplicatePatientNeedsConfirmation`; Postman 03 "Pasien kembar" | Lulus |
| TC-13 | Jadwal dokter bertabrakan | Ditolak | Yii `MasterDataTest::testScheduleOverlapIsRejected` | Lulus |
| TC-14 | Stok obat diubah lewat CRUD biasa / tanpa alasan | Stok hanya berubah lewat mutasi stok yang tercatat; penyesuaian tanpa alasan 422 | Yii `MasterDataTest::testMedicineStockOnlyChangesThroughLedger`; Postman 02 "Penyesuaian stok tanpa alasan" | Lulus |

## C. Pendaftaran dan antrean (D1)

| ID | Skenario | Hasil yang diharapkan | Bukti | Status |
|---|---|---|---|---|
| TC-15 | Daftarkan kunjungan ke poli | Nomor antrean terbit, status `waiting`, invoice berisi biaya pendaftaran otomatis dibuat | Postman 03 "Daftarkan kunjungan", "Tagihan otomatis dibuat"; E2E | Lulus |
| TC-16 | Pasien sama didaftarkan ulang di poli dan tanggal yang sama | 409 `DUPLICATE_VISIT` | Postman 03 "Daftar ulang pasien sama -> 409 (D1)" | Lulus |
| TC-17 | 10 request paralel mendaftarkan pasien yang sama | Tepat 1 berhasil | Yii `ConcurrencyTest::testSamePatientRegisteredConcurrentlyOnlyOnce` | Lulus |
| TC-18 | 12 pasien berbeda mendaftar bersamaan | Nomor antrean unik dan berurutan tanpa celah | Yii `ConcurrencyTest::testConcurrentRegistrationsGetUniqueQueueNumbers` | Lulus |
| TC-19 | Batalkan kunjungan, dengan dan tanpa alasan | Tanpa alasan 422; dengan alasan status `cancelled`, tagihan di-void | Yii `ServiceFlowTest::testCancelRegistration`; Postman 03 "Batalkan…" | Lulus |

## D. Pemeriksaan dokter

| ID | Skenario | Hasil yang diharapkan | Bukti | Status |
|---|---|---|---|---|
| TC-20 | Panggil pasien, isi anamnesis, vital sign, diagnosis ICD-10 | Status `in_exam`, data tersimpan sebagai draft | Postman 04 "Panggil pasien", "Simpan anamnesis…"; E2E | Lulus |
| TC-21 | Vital sign di luar batas wajar | 422 dengan detail field | Postman 04 "Vital sign tidak wajar -> 422" | Lulus |
| TC-22 | Tambah tindakan | Tindakan masuk invoice dengan harga snapshot | Postman 04 "Tambah tindakan…"; Yii `ServiceFlowTest::testFullOutpatientFlow` | Lulus |
| TC-23 | Resep melebihi stok | 422 | Postman 04 "Resep melebihi stok -> 422"; Yii `ServiceFlowTest::testFullOutpatientFlow` | Lulus |
| TC-24 | Finalkan pemeriksaan | Status kunjungan `exam_done` | Postman 04 "Selesaikan pemeriksaan" | Lulus |

## E. Farmasi dan stok (D2)

| ID | Skenario | Hasil yang diharapkan | Bukti | Status |
|---|---|---|---|---|
| TC-25 | Serahkan obat | Stok berkurang, mutasi tercatat, obat masuk invoice | Postman 06 "Serahkan obat"; E2E | Lulus |
| TC-26 | Resep yang sama diserahkan ulang / diproses 5x bersamaan | 409; obat keluar sekali | Postman 06 "Serahkan ulang -> 409 (D2)"; Yii `ConcurrencyTest::testSamePrescriptionDispensedOnce` | Lulus |
| TC-27 | Dua resep berebut stok terakhir bersamaan | 1 berhasil, stok tidak pernah minus | Yii `ConcurrencyTest::testConcurrentDispenseNeverMakesStockNegative` | Lulus |

## F. Laboratorium dan services-node

| ID | Skenario | Hasil yang diharapkan | Bukti | Status |
|---|---|---|---|---|
| TC-28 | Worklist lab dengan filter dan paginasi | Data dan `meta` paginasi benar; query tidak valid 400 | Node "lab: daftar permintaan + paginasi", "lab: validasi query"; Postman 05 | Lulus |
| TC-29 | Input hasil lab lewat Node | Diteruskan ke Yii dengan service token dan idempotency key; permintaan `completed` bila semua item ada hasil | Node "hasil lab diteruskan ke Yii…"; Yii `IntegrationTest::testLabResultIsIdempotentAndCompletesRequest`; Postman 05 | Lulus |
| TC-30 | Body hasil lab kosong / berisi field asing | 400, tidak sampai ke Yii | Node "hasil lab: body tidak valid…"; Postman 05 "Validasi hasil kosong -> 400" | Lulus |
| TC-31 | Permintaan lab dibatalkan | Item lab dihapus dari invoice (void) | Yii `IntegrationTest::testCancelledLabRequestIsRemovedFromInvoice` | Lulus |
| TC-32 | Node mencoba menulis ke tabel bisnis | Ditolak database (user read-only) | Node "Node tidak bisa menulis ke tabel bisnis" | Lulus |

## G. Billing dan pembayaran (D3)

| ID | Skenario | Hasil yang diharapkan | Bukti | Status |
|---|---|---|---|---|
| TC-33 | Bayar sebagian lalu lunasi (tunai dan non-tunai) | Status `partial` lalu `paid`; kunjungan `completed` | Postman 07 "Bayar sebagian", "Pelunasan", "Kunjungan otomatis selesai"; Yii `ServiceFlowTest::testFullOutpatientFlow` | Lulus |
| TC-34 | Bayar tanpa header `Idempotency-Key` | 400 | Postman 07 "Bayar tanpa Idempotency-Key -> 400" | Lulus |
| TC-35 | Pembayaran di-retry dengan kunci sama (6x bersamaan) | Tercatat 1x, respons `replayed: true` | Yii `ConcurrencyTest::testRetriedPaymentIsRecordedOnce`; Postman 07 "Retry kunci sama" | Lulus |
| TC-36 | Kunci sama dengan nominal berbeda | 422 | Postman 07 "Kunci sama nominal beda -> 422" | Lulus |
| TC-37 | Bayar melebihi sisa / dua kasir melunasi bersamaan | 422; total terbayar tidak pernah melebihi tagihan | Postman 07 "Bayar melebihi sisa"; Yii `ConcurrencyTest::testConcurrentPaymentsCannotExceedInvoiceTotal` | Lulus |
| TC-38 | Cetak invoice dan bukti pembayaran | HTML siap cetak / simpan PDF | Postman 07 "Cetak invoice", "Cetak bukti pembayaran"; Yii `ServiceFlowTest::testFullOutpatientFlow` | Lulus |

## H. Koreksi setelah billing (D4)

| ID | Skenario | Hasil yang diharapkan | Bukti | Status |
|---|---|---|---|---|
| TC-39 | Ubah diagnosis setelah final, tanpa dan dengan alasan | Tanpa alasan 422; dengan alasan tersimpan, diagnosis lama di-void, tercatat di audit log | Yii `ChangeAfterBillingTest::testDiagnosisChangeAfterFinalNeedsReasonAndIsTraceable`; Postman 04 "Ubah diagnosis…", "Jejak perubahan" | Lulus |
| TC-40 | Tindakan dibatalkan setelah lunas | Invoice direvisi, muncul kelebihan bayar, refund maksimal sebesar kelebihan | Yii `ChangeAfterBillingTest::testProcedureVoidedAfterPaymentRevisesInvoiceAndAllowsRefund`; Postman 08 | Lulus |
| TC-41 | Tindakan ditambah setelah lunas | Status invoice kembali `partial` | Yii `ChangeAfterBillingTest::testProcedureAddedAfterPaymentReopensBalance` | Lulus |

## I. Integrasi dan gangguan service (D5)

| ID | Skenario | Hasil yang diharapkan | Bukti | Status |
|---|---|---|---|---|
| TC-42 | Node mati saat outbox mengirim event | Event tetap `pending` dan dijadwalkan ulang dengan backoff | Yii `IntegrationTest::testOutboxRetriesWhenNodeIsDown` | Lulus |
| TC-43 | Yii gangguan sesaat saat Node meneruskan hasil lab | Retry otomatis dengan kunci idempotensi yang sama | Node "gangguan Yii sesaat: retry otomatis…"; Postman 05 "Yii internal: retry kunci sama" | Lulus |
| TC-44 | Yii mati total | Node membalas 503, tidak mengklaim sukses | Node "Yii mati total: 503 konsisten…" | Lulus |
| TC-45 | Event yang sama diterima Node dua kali | 202, ditandai duplikat, tidak diproses ulang | Node "event integrasi: wajib service token, idempoten…"; Postman 10 | Lulus |

## J. Dashboard dan laporan

| ID | Skenario | Hasil yang diharapkan | Bukti | Status |
|---|---|---|---|---|
| TC-46 | Ringkasan dashboard | Angka cocok dengan data (kunjungan, tindakan, pendapatan bersih setelah refund) | Node "dashboard summary: angka cocok…"; Postman 09 "Ringkasan" | Lulus |
| TC-47 | Filter periode, poli, status bayar, drill-down | Data sesuai filter; tanpa filter = 30 hari terakhir | Node "dashboard: endpoint rincian & filter", "tanpa filter…"; Postman 09 | Lulus |
| TC-48 | Periode terbalik / tidak valid | 400 | Node "dashboard: periode tidak valid -> 400"; Postman 09 "Periode terbalik" | Lulus |
| TC-49 | Petugas lab membuka dashboard | 403 | Postman 09 "Petugas lab buka dashboard -> 403" | Lulus |

## K. Alur lengkap

| ID | Skenario | Hasil yang diharapkan | Bukti | Status |
|---|---|---|---|---|
| TC-50 | Pendaftaran, pemeriksaan, tindakan, resep, farmasi, lab, billing, bayar bertahap, lunas, cetak | Semua langkah sukses, invoice dan status konsisten di tiap langkah | Yii `ServiceFlowTest::testFullOutpatientFlow`; E2E (screenshot `docs/screenshots/01`–`18`) | Lulus |

Skenario D6 (performa) dibuktikan lewat desain index dan query, bukan test otomatis. Rinciannya ada di [`01_arsitektur.md`](01_arsitektur.md) bagian 6.

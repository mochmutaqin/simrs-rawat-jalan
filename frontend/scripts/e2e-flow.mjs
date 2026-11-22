/**
 * Uji end-to-end alur pelayanan lewat browser + ambil screenshot (bukti implementasi).
 * Prasyarat: backend Yii (:8080), services-node (:3001), dan `npm run dev` (:5173) menyala,
 * data demo sudah di-seed. Jalankan:  node scripts/e2e-flow.mjs [folder-output]
 * Butuh playwright:  npm i -D playwright && npx playwright install chromium
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const BASE = process.env.FRONTEND_URL || 'http://127.0.0.1:5173';
const OUT = process.argv[2] || 'screenshots';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, locale: 'id-ID', timezoneId: 'Asia/Jakarta' });
const problems = [];
let shotNo = 0;
const step = (m) => console.log(`\n▶ ${m}`);
const ok = (m) => console.log(`  ✓ ${m}`);

async function page() {
  const p = await ctx.newPage();
  p.on('console', (m) => m.type() === 'error' && problems.push(`console: ${m.text()}`));
  p.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
  p.on('response', (r) => { if (r.status() >= 500) problems.push(`HTTP ${r.status()} ${r.url()}`); });
  return p;
}
async function shot(p, name, fullPage = false) {
  shotNo += 1;
  const file = `${OUT}/${String(shotNo).padStart(2, '0')}-${name}.png`;
  await p.evaluate(() => window.scrollTo(0, 0));
  await p.locator('[aria-live="polite"] > div').first().waitFor({ state: 'detached', timeout: 6000 }).catch(() => {});
  await p.waitForTimeout(300);
  await p.screenshot({ path: file, fullPage });
  ok(`screenshot ${file}`);
}
async function login(p, username) {
  await p.goto(BASE + '/');
  await p.getByLabel('Username').fill(username);
  await p.getByLabel('Password').fill('password123');
  await p.getByRole('button', { name: 'Masuk', exact: true }).click();
  await p.getByText('Masuk sebagai').waitFor();
  ok(`login ${username}`);
}
async function logout(p) { await p.getByRole('button', { name: 'Keluar' }).first().click(); await p.getByRole('heading', { name: 'Masuk' }).waitFor(); }
async function selectByText(select, text) {
  const value = await select.locator('option', { hasText: text }).first().getAttribute('value');
  await select.selectOption(value);
}
const toast = (p, text) => p.getByText(text).first().waitFor({ timeout: 10000 });

const patientName = `Dewi Lestari ${Date.now().toString().slice(-4)}`;
const p = await page();

/* ---------- 1. login ---------- */
step('Halaman login');
await p.goto(BASE + '/');
await shot(p, 'login');

/* ---------- 2. pendaftaran ---------- */
step('Petugas pendaftaran: pasien baru + daftar kunjungan');
await login(p, 'pendaftaran');
await p.getByRole('button', { name: 'Daftarkan kunjungan' }).first().click();
await p.getByRole('button', { name: 'Pasien baru' }).click();
await p.getByLabel('Nama lengkap').fill(patientName);
await p.getByLabel('NIK').fill(String(3273000000000000 + Math.floor(Math.random() * 1e9)));
await p.getByLabel('Nomor HP').fill('081298765432');
await p.getByLabel('Tanggal lahir').fill('1988-04-12');
await p.getByLabel('Jenis kelamin').selectOption('P');
await p.getByLabel('Alamat').fill('Jl. Cihampelas No. 45, Bandung');
await p.getByRole('button', { name: 'Simpan pasien' }).click();
await p.getByRole('radio', { name: /Poli Umum/ }).click();
await shot(p, 'pendaftaran-pilih-dokter');
await p.getByRole('button', { name: /Daftarkan & ambil nomor antrean/ }).click();
await p.getByText('Pendaftaran berhasil').waitFor();
await shot(p, 'pendaftaran-nomor-antrean');
await p.getByRole('button', { name: 'Tutup' }).last().click();
// pasien demo kedua supaya antrean & dashboard tidak kosong
await p.getByRole('button', { name: 'Daftarkan kunjungan' }).first().click();
await p.getByPlaceholder('No. RM, NIK, atau nama pasien').fill('Siti');
await p.getByRole('button', { name: /Siti Nurhaliza/ }).click();
await p.getByRole('radio', { name: /Poli Gigi/ }).click();
await p.getByRole('button', { name: /Daftarkan & ambil nomor antrean/ }).click();
await p.getByText('Pendaftaran berhasil').waitFor();
await p.getByRole('button', { name: 'Tutup' }).last().click();
await p.getByText(patientName).waitFor();
await shot(p, 'pendaftaran-antrean');
await logout(p);

/* ---------- 3. dokter ---------- */
step('Dokter: panggil, periksa, tindakan, resep, lab, selesaikan');
await login(p, 'dokter.umum');
await p.goto(BASE + '/pemeriksaan');
await p.getByText(patientName).first().waitFor();
await shot(p, 'dokter-antrean');
await p.getByRole('listitem').filter({ hasText: patientName }).getByRole('button', { name: 'Panggil' }).click();
await p.getByRole('heading', { name: patientName }).waitFor();
await p.getByLabel('Keluhan utama').fill('Demam dan batuk berdahak sejak 3 hari');
await p.getByLabel('Anamnesis').fill('Demam naik turun, nafsu makan menurun, tidak ada sesak.');
for (const [label, v] of [['Sistolik (mmHg)', '118'], ['Diastolik (mmHg)', '78'], ['Nadi (x/menit)', '92'], ['Napas (x/menit)', '20'], ['Suhu (°C)', '38.3'], ['SpO₂ (%)', '98'], ['Berat (kg)', '58'], ['Tinggi (cm)', '160']]) {
  await p.getByLabel(label).fill(v);
}
await p.getByLabel('Pemeriksaan fisik').fill('Faring hiperemis, tonsil T1-T1, paru vesikuler tanpa ronkhi.');
await p.getByRole('button', { name: 'Tambah diagnosis' }).click();
await p.getByLabel('Kode ICD-10').nth(0).fill('J06.9');
await p.getByRole('button', { name: 'Tambah diagnosis' }).click();
await p.getByLabel('Kode ICD-10').nth(1).fill('R50.9');
await p.getByRole('button', { name: 'Simpan draf' }).click();
await toast(p, 'Pemeriksaan disimpan');

const proc = p.locator('section', { has: p.getByRole('heading', { name: /Tindakan medis/ }) });
await proc.getByLabel('Tindakan').selectOption({ label: 'Konsultasi dokter umum · Rp 50.000' });
await proc.getByRole('button', { name: 'Tambah' }).click();
await toast(p, 'Tindakan ditambahkan');
await proc.getByLabel('Tindakan').selectOption({ label: 'Nebulizer · Rp 75.000' });
await proc.getByRole('button', { name: 'Tambah' }).click();
await proc.getByText('Nebulizer', { exact: true }).waitFor();

const rx = p.locator('section', { has: p.getByRole('heading', { name: /Resep obat/ }) });
await selectByText(rx.getByLabel('Obat').nth(0), 'Paracetamol');
await rx.getByLabel('Dosis').nth(0).fill('500 mg');
await rx.getByLabel('Frekuensi').nth(0).fill('3x sehari');
await rx.getByLabel('Jumlah').nth(0).fill('10');
await rx.getByRole('button', { name: 'Tambah obat' }).click();
await selectByText(rx.getByLabel('Obat').nth(1), 'OBH');
await rx.getByLabel('Dosis').nth(1).fill('1 sendok makan');
await rx.getByLabel('Frekuensi').nth(1).fill('3x sehari');
await rx.getByLabel('Jumlah').nth(1).fill('1');
await rx.getByRole('button', { name: 'Kirim resep ke farmasi' }).click();
await toast(p, 'Resep dikirim');

const lab = p.locator('section', { has: p.getByRole('heading', { name: /Pemeriksaan laboratorium/ }) });
await lab.getByLabel(/Hemoglobin/).check();
await lab.getByLabel(/Leukosit/).check();
await lab.getByRole('button', { name: 'Kirim permintaan lab' }).click();
await toast(p, 'Permintaan dikirim');

await p.getByRole('button', { name: 'Selesaikan pemeriksaan' }).click();
await toast(p, 'Pemeriksaan selesai');
await p.getByText('Final').first().waitFor();
await shot(p, 'dokter-pemeriksaan', true);

// koreksi diagnosis setelah final -> wajib alasan, tercatat di jejak perubahan
await p.getByLabel('Nama diagnosis').nth(1).fill('Demam, observasi');
await p.getByLabel(/Alasan perubahan/).fill('Klarifikasi diagnosis sekunder setelah anamnesis ulang');
await p.getByRole('button', { name: 'Simpan koreksi' }).click();
await toast(p, 'Pemeriksaan disimpan');
await p.getByRole('button', { name: 'Jejak perubahan' }).click();
await p.getByText(/Klarifikasi diagnosis/).first().waitFor();
await shot(p, 'dokter-jejak-perubahan');
await p.keyboard.press('Escape');
await logout(p);

/* ---------- 4. laboratorium (Node -> Yii) ---------- */
step('Petugas lab: input hasil (lewat services-node)');
await login(p, 'lab');
await p.goto(BASE + '/lab');
await p.getByRole('button', { name: new RegExp(patientName) }).click();
await p.getByLabel('Hasil Hemoglobin').fill('12.8');
await p.locator('li', { has: p.getByLabel('Hasil Hemoglobin') }).getByRole('button', { name: 'Simpan' }).click();
await toast(p, 'Hasil Hemoglobin disimpan');
await p.getByLabel('Hasil Leukosit').fill('11.6');
await p.locator('li', { has: p.getByLabel('Hasil Leukosit') }).getByLabel('Interpretasi').selectOption('high');
await p.locator('li', { has: p.getByLabel('Hasil Leukosit') }).getByRole('button', { name: 'Simpan' }).click();
await toast(p, 'Semua hasil lengkap');
await p.getByText('Selesai').first().waitFor();
await shot(p, 'lab-input-hasil');
await logout(p);

/* ---------- 5. farmasi ---------- */
step('Petugas farmasi: serahkan obat');
await login(p, 'farmasi');
await p.goto(BASE + '/farmasi');
await p.getByText(patientName).first().waitFor();
await shot(p, 'farmasi-resep-masuk');
await p.locator('article', { hasText: patientName }).getByRole('button', { name: 'Serahkan obat' }).click();
await p.getByRole('button', { name: 'Ya, serahkan obat' }).click();
await toast(p, 'Obat diserahkan');
await p.goto(BASE + '/farmasi/stok');
await p.getByText('Paracetamol 500 mg').waitFor();
await shot(p, 'farmasi-stok-obat');
await logout(p);

/* ---------- 6. kasir ---------- */
step('Kasir: bayar bertahap (tunai + QRIS), cetak invoice');
await login(p, 'kasir');
await p.goto(BASE + '/kasir');
await p.getByRole('row', { name: new RegExp(patientName) }).getByRole('link').click();
await p.getByText('Rincian biaya').waitFor();
await shot(p, 'kasir-rincian-tagihan', true);
await p.getByRole('button', { name: 'Terima pembayaran' }).click();
await p.getByLabel('Jumlah dibayar').fill('100000');
await p.getByLabel('Uang diterima (opsional)').fill('100000');
await p.getByRole('button', { name: /Catat pembayaran/ }).click();
await toast(p, 'tercatat');
await p.getByText('Dibayar sebagian').first().waitFor();
await p.getByRole('button', { name: 'Terima pembayaran' }).click();
await p.getByLabel('Metode').selectOption('non_cash');
await p.getByLabel('Channel').selectOption('qris');
await shot(p, 'kasir-form-bayar-qris');
await p.getByRole('button', { name: /Catat pembayaran/ }).click();
await p.getByText('Lunas').first().waitFor();
await shot(p, 'kasir-lunas', true);
const [popup] = await Promise.all([p.waitForEvent('popup'), p.getByRole('button', { name: 'Cetak invoice' }).click()]);
await popup.getByText('INVOICE').waitFor();
await popup.setViewportSize({ width: 900, height: 1200 });
await shot(popup, 'invoice-cetak', true);
await popup.close();
const [popup2] = await Promise.all([p.waitForEvent('popup'), p.getByRole('button', { name: /Cetak bukti/ }).last().click()]);
await popup2.getByText('BUKTI PEMBAYARAN').waitFor();
await popup2.setViewportSize({ width: 520, height: 900 });
await shot(popup2, 'bukti-pembayaran', true);
await popup2.close();
await logout(p);

/* ---------- 7. admin ---------- */
step('Administrator: dashboard, master data, pasien');
await login(p, 'admin');
await p.goto(BASE + '/dashboard');
await p.getByText('Pendapatan harian').waitFor();
await p.getByRole('button', { name: 'Hari ini' }).click();
await p.waitForTimeout(800);
await shot(p, 'dashboard', true);
await p.goto(BASE + '/master/doctor-schedules');
await p.getByText('dr. Andi Pratama').first().waitFor();
await shot(p, 'master-jadwal-praktik');
await p.goto(BASE + '/pasien');
await p.getByText(patientName).click();
await p.getByRole('tab', { name: 'Rekam medis' }).click();
await p.getByText('Hasil laboratorium').waitFor();
await shot(p, 'pasien-rekam-medis', true);

/* ---------- 8. RBAC di UI ---------- */
step('Hak akses: kasir tidak melihat menu dokter/farmasi');
await logout(p);
await login(p, 'kasir');
const menu = await p.getByRole('navigation', { name: 'Menu utama' }).innerText();
if (/Antrean dokter|Resep masuk|Pengguna/.test(menu)) problems.push('RBAC UI: kasir melihat menu yang bukan haknya');
else ok('menu kasir hanya: ' + menu.split('\n').filter((l) => l.trim()).join(' | '));
await p.goto(BASE + '/pemeriksaan');
await p.getByText('Anda tidak punya akses ke halaman ini').waitFor();
ok('halaman dokter ditolak untuk kasir');

await browser.close();
console.log(problems.length ? `\n✗ ${problems.length} masalah:\n- ${problems.join('\n- ')}` : '\n✓ Alur lengkap berhasil tanpa error console / HTTP 5xx');
process.exit(problems.length ? 1 : 0);

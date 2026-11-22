/**
 * SIMRS Rawat Jalan
 *
 * @author  Mochamad Mutaqin Kurniawan <mochmutaqin@gmail.com>
 * @link    https://github.com/mochmutaqin/simrs-rawat-jalan
 */

import { yii } from '../api/client';

/** Ambil HTML cetak (butuh token) lalu tampilkan di jendela baru untuk dicetak / disimpan PDF. */
export async function openPrint(path) {
  const w = window.open('', '_blank');           // dibuka dulu agar tidak diblokir popup blocker
  if (!w) throw new Error('Popup diblokir browser. Izinkan popup untuk mencetak.');
  w.document.write('<p style="font-family:sans-serif;padding:24px">Menyiapkan dokumen…</p>');
  try {
    const html = await yii.html(path);
    w.document.open(); w.document.write(html); w.document.close();
  } catch (e) {
    w.close();
    throw e;
  }
}

const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/**
 * Cetak laporan tabel di jendela baru (A4 mendatar), siap disimpan sebagai PDF.
 * Jendela dibuka dulu secara sinkron agar tidak diblokir popup blocker, lalu diisi setelah data siap.
 *   load() -> { title, period, printedBy, filters: [teks], summary: [[label, nilai]], columns: [[judul, (row) => nilai, 'right'?]], rows, note }
 */
export async function printReport(load) {
  const w = window.open('', '_blank');
  if (!w) throw new Error('Popup diblokir browser. Izinkan popup untuk mencetak.');
  w.document.write('<p style="font-family:sans-serif;padding:24px">Menyiapkan laporan…</p>');
  try {
    const r = await load();
    const printedAt = new Date().toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Jakarta' });
    const cls = (align) => (align === 'right' ? 'right' : '');
    const head = r.columns.map(([h, , align]) => `<th class="${cls(align)}">${esc(h)}</th>`).join('');
    const body = r.rows.length
      ? r.rows.map((row, i) => `<tr><td class="right muted">${i + 1}</td>${r.columns.map(([, fn, align]) => `<td class="${cls(align)}">${esc(fn(row))}</td>`).join('')}</tr>`).join('')
      : `<tr><td colspan="${r.columns.length + 1}" class="muted">Tidak ada data untuk filter ini.</td></tr>`;
    w.document.open();
    w.document.write(`<!doctype html><html lang="id"><head><meta charset="utf-8"><title>${esc(r.title)} ${esc(r.period)}</title>
<style>
  @page { size: A4 landscape; margin: 12mm; }
  * { box-sizing: border-box; }
  body { font-family: "Segoe UI", Arial, sans-serif; color: #173230; font-size: 10.5pt; margin: 0; padding: 16px; }
  header { display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 2px solid #0E6B5C; padding-bottom: 8px; }
  h1 { font-size: 16pt; margin: 2px 0 0; }
  .org { font-weight: 700; color: #0E6B5C; }
  .meta { text-align: right; color: #4d625f; font-size: 9.5pt; line-height: 1.5; }
  .filters { margin: 10px 0 0; color: #4d625f; }
  .summary { display: flex; flex-wrap: wrap; gap: 8px; margin: 12px 0; }
  .summary div { border: 1px solid #d3ddda; border-radius: 6px; padding: 6px 10px; min-width: 120px; }
  .summary span { display: block; color: #4d625f; font-size: 9pt; }
  .summary b { font-size: 12pt; }
  table { width: 100%; border-collapse: collapse; }
  th, td { border: 1px solid #d3ddda; padding: 4px 6px; text-align: left; vertical-align: top; }
  th { background: #eef3f2; font-size: 9.5pt; }
  thead { display: table-header-group; }
  tr { break-inside: avoid; }
  .right { text-align: right; font-variant-numeric: tabular-nums; }
  .muted { color: #6b7d7a; }
  .note { margin-top: 8px; color: #8a5a00; }
  footer { margin-top: 10px; color: #6b7d7a; font-size: 9pt; }
</style></head><body>
<header>
  <div><div class="org">RS Inova Medika (demo), SIMRS Rawat Jalan</div><h1>${esc(r.title)}</h1></div>
  <div class="meta">Periode: <b>${esc(r.period)}</b><br>Dicetak: ${esc(printedAt)}${r.printedBy ? ` oleh ${esc(r.printedBy)}` : ''}</div>
</header>
${r.filters?.length ? `<p class="filters">Filter: ${r.filters.map(esc).join('; ')}</p>` : ''}
<section class="summary">${r.summary.map(([l, v]) => `<div><span>${esc(l)}</span><b>${esc(v)}</b></div>`).join('')}</section>
<table><thead><tr><th class="right">No</th>${head}</tr></thead><tbody>${body}</tbody></table>
${r.note ? `<p class="note">${esc(r.note)}</p>` : ''}
<footer>Sumber data: services-node (read-only). Jumlah baris: ${r.rows.length}.</footer>
<script>window.addEventListener('load', () => setTimeout(() => window.print(), 300));</script>
</body></html>`);
    w.document.close();
  } catch (e) {
    w.close();
    throw e;
  }
}

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

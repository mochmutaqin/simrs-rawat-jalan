/**
 * SIMRS Rawat Jalan
 *
 * @author  Mochamad Mutaqin Kurniawan <mochmutaqin@gmail.com>
 * @link    https://github.com/mochmutaqin/simrs-rawat-jalan
 */

const rupiahFmt = new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 });
const numFmt = new Intl.NumberFormat('id-ID');

export const rupiah = (n) => rupiahFmt.format(Number(n || 0));
export const num = (n) => numFmt.format(Number(n || 0));

export const TZ = 'Asia/Jakarta';
export const today = () => new Date().toLocaleDateString('en-CA', { timeZone: TZ });
export const shiftDate = (iso, days) => {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + days);
  return d.toLocaleDateString('en-CA');
};

export const tanggal = (iso) => (iso ? new Date(`${String(iso).slice(0, 10)}T00:00:00`).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }) : '-');
export const tanggalPanjang = (iso) => new Date(`${iso}T00:00:00`).toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
export const jam = (ts) => (ts ? new Date(ts).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', timeZone: TZ }) : '-');
export const waktu = (ts) => (ts ? new Date(ts).toLocaleString('id-ID', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: TZ }) : '-');

export const umur = (birth) => {
  if (!birth) return '';
  const b = new Date(`${birth}T00:00:00`); const n = new Date();
  let y = n.getFullYear() - b.getFullYear();
  if (n < new Date(n.getFullYear(), b.getMonth(), b.getDate())) y -= 1;
  return `${y} th`;
};

export const VISIT_STATUS = {
  waiting: { label: 'Menunggu', tone: 'wait' },
  in_exam: { label: 'Diperiksa', tone: 'exam' },
  exam_done: { label: 'Selesai diperiksa', tone: 'done' },
  completed: { label: 'Selesai', tone: 'done' },
  cancelled: { label: 'Batal', tone: 'cancel' },
};
export const INVOICE_STATUS = {
  unpaid: { label: 'Belum dibayar', tone: 'danger' },
  partial: { label: 'Dibayar sebagian', tone: 'wait' },
  paid: { label: 'Lunas', tone: 'done' },
};
export const RX_STATUS = {
  pending: { label: 'Menunggu', tone: 'wait' },
  dispensed: { label: 'Diserahkan', tone: 'done' },
  cancelled: { label: 'Batal', tone: 'cancel' },
};
export const LAB_STATUS = {
  requested: { label: 'Diminta', tone: 'wait' },
  in_progress: { label: 'Dikerjakan', tone: 'exam' },
  completed: { label: 'Selesai', tone: 'done' },
  cancelled: { label: 'Batal', tone: 'cancel' },
};

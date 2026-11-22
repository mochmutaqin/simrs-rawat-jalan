/**
 * SIMRS Rawat Jalan
 *
 * @author  Mochamad Mutaqin Kurniawan <mochmutaqin@gmail.com>
 * @link    https://github.com/mochmutaqin/simrs-rawat-jalan
 */

import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Download, Printer } from 'lucide-react';
import { node, yii } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { PageHeader } from '../components/Layout';
import { PeriodFilter, usePeriod } from '../components/PeriodFilter';
import { Badge, Button, Empty, ErrorBox, Input, Pagination, Select, Spinner, Stat, StatGrid, StatusBadge, Tabs, useToast } from '../components/ui';
import { num, rupiah, RX_STATUS, tanggal, TZ } from '../lib/format';
import { printReport } from '../lib/print';
import { useApi } from '../lib/useApi';

const GENDER = { L: 'Laki-laki', P: 'Perempuan' };
const tanggalJam = (ts) => new Date(ts).toLocaleString('id-ID', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: TZ });
const BASIS = { registered: 'Terdaftar pada periode', visited: 'Berkunjung pada periode' };
const STOCK_STATUS = {
  ok: { label: 'Aman', tone: 'done' },
  low: { label: 'Menipis', tone: 'wait' },
  out: { label: 'Habis', tone: 'danger' },
};

/**
 * Konfigurasi tiap laporan. columns: [judul, nilai teks (dipakai cetak), rata kanan?, tampilan di layar?].
 * Data diambil dari services-node (read-only); format=csv di endpoint yang sama untuk unduhan Excel.
 */
const REPORTS = {
  patients: {
    label: 'Data pasien',
    title: 'Laporan Data Pasien',
    perms: ['report.view'],
    path: '/reports/patients',
    minWidth: 'min-w-[880px]',
    initial: { basis: 'registered', gender: '', q: '' },
    describe: (f) => [BASIS[f.basis], f.gender && GENDER[f.gender], f.q && `cari "${f.q}"`],
    stats: (s) => [
      ['Jumlah pasien', num(s.total_patients), true, `${num(s.total_visits)} kunjungan pada periode`],
      ['Laki-laki', num(s.male)],
      ['Perempuan', num(s.female)],
      ['Anak (di bawah 18 th)', num(s.age_child)],
      ['Dewasa (18 sampai 59 th)', num(s.age_adult)],
      ['Lansia (60 th ke atas)', num(s.age_elderly)],
    ],
    columns: [
      ['No. RM', (r) => r.medical_record_no, 'nowrap'],
      ['Nama', (r) => r.name, '', (r) => <>{r.name}{r.nik && <p className="num text-[0.82rem] text-ink-soft">NIK {r.nik}</p>}</>],
      ['JK', (r) => GENDER[r.gender]],
      ['Umur', (r) => `${r.age} th`, 'right'],
      ['Telepon', (r) => r.phone || '-', 'nowrap'],
      ['Tgl daftar', (r) => tanggal(r.registered_at), 'nowrap'],
      ['Kunjungan periode', (r) => num(r.visits_in_period), 'right'],
      ['Kunjungan terakhir', (r) => (r.last_visit ? tanggal(r.last_visit) : '-'), 'nowrap'],
    ],
  },
  stock: {
    label: 'Stok obat',
    title: 'Laporan Stok Obat',
    perms: ['report.view', 'medicine.manage'],
    path: '/reports/medicine-stock',
    minWidth: 'min-w-[960px]',
    initial: { status: '', q: '' },
    describe: (f) => [f.status && `status ${STOCK_STATUS[f.status].label.toLowerCase()}`, f.q && `cari "${f.q}"`],
    stats: (s) => [
      ['Jenis obat', num(s.total_items), false, `${num(s.status_ok)} aman, total ${num(s.total_units)} unit`],
      ['Nilai stok', rupiah(s.stock_value), true],
      ['Masuk pada periode', `${num(s.total_in)} unit`],
      ['Keluar pada periode', `${num(s.total_out)} unit`],
      ['Menipis', num(s.status_low), false, 'di bawah stok minimum'],
      ['Habis', num(s.status_out)],
    ],
    columns: [
      ['Obat', (r) => `${r.code} ${r.name}`, '', (r) => <>{r.name}<p className="num text-[0.82rem] text-ink-soft">{r.code}, per {r.unit}</p></>],
      ['Stok awal', (r) => num(r.stock_start), 'right'],
      ['Masuk', (r) => num(r.qty_in), 'right'],
      ['Keluar', (r) => num(r.qty_out), 'right'],
      ['Penyesuaian', (r) => num(r.qty_adjust), 'right'],
      ['Stok akhir', (r) => num(r.stock_end), 'right'],
      ['Stok kini / min.', (r) => `${num(r.stock)} / ${num(r.min_stock)}`, 'right'],
      ['Status', (r) => STOCK_STATUS[r.status].label, '', (r) => <StatusBadge map={STOCK_STATUS} value={r.status} />],
      ['Nilai stok', (r) => rupiah(r.stock_value), 'right'],
    ],
    note: 'Status memakai stok saat ini. Stok awal, masuk, keluar, dan stok akhir mengikuti periode yang dipilih.',
  },
  prescriptions: {
    label: 'Resep',
    title: 'Laporan Jumlah Resep',
    perms: ['report.view'],
    path: '/reports/prescriptions',
    minWidth: 'min-w-[860px]',
    initial: { status: '', poli_id: '', doctor_id: '' },
    describe: (f, names) => [f.status && RX_STATUS[f.status].label, f.poli_id && names.poli, f.doctor_id && names.doctor],
    stats: (s) => [
      ['Jumlah resep', num(s.total_prescriptions), true],
      ['Menunggu', num(s.pending)],
      ['Diserahkan', num(s.dispensed)],
      ['Dibatalkan', num(s.cancelled)],
      ['Obat diresepkan', `${num(s.total_qty)} unit`, false, 'tanpa resep yang dibatalkan'],
      ['Nilai obat diserahkan', rupiah(s.dispensed_amount)],
    ],
    columns: [
      ['Tanggal', (r) => tanggalJam(r.created_at)],
      ['Pasien', (r) => `${r.patient_name} (${r.medical_record_no})`, '', (r) => <>{r.patient_name}<p className="num whitespace-nowrap text-[0.82rem] text-ink-soft">{r.medical_record_no}</p></>],
      ['Poli / dokter', (r) => `${r.poli}, ${r.doctor}`, '', (r) => <>{r.poli}<p className="text-[0.82rem] text-ink-soft">{r.doctor}</p></>],
      ['Item', (r) => num(r.item_count), 'right'],
      ['Jumlah obat', (r) => num(r.total_qty), 'right'],
      ['Nilai', (r) => rupiah(r.total_amount), 'right'],
      ['Status', (r) => RX_STATUS[r.status].label, '', (r) => <StatusBadge map={RX_STATUS} value={r.status} />],
    ],
  },
};

export default function Reports() {
  const { can } = useAuth();
  const tabs = Object.entries(REPORTS).filter(([, r]) => can(...r.perms)).map(([value, r]) => ({ value, label: r.label }));
  const [params, setParams] = useSearchParams();
  const tab = tabs.some((t) => t.value === params.get('tab')) ? params.get('tab') : tabs[0]?.value;
  // periode dan filter disimpan di sini agar tidak hilang saat berpindah tab
  const period = usePeriod('30d');
  const [filters, setFilters] = useState(() => Object.fromEntries(Object.entries(REPORTS).map(([k, r]) => [k, r.initial])));

  if (!tab) return <Empty title="Anda tidak punya akses ke laporan" />;
  return (
    <ReportPage key={tab} tab={tab} tabs={tabs} onTab={(t) => setParams({ tab: t }, { replace: true })} period={period}
      filters={filters[tab]} setFilters={(patch) => setFilters((all) => ({ ...all, [tab]: { ...all[tab], ...patch } }))} />
  );
}

/** Satu laporan (dipasang ulang tiap ganti tab, jadi data tab lain tidak pernah tercampur). */
function ReportPage({ tab, tabs, onTab, period, filters: f, setFilters }) {
  const { user } = useAuth();
  const toast = useToast();
  const cfg = REPORTS[tab];
  const [page, setPage] = useState(1);
  const [busy, setBusy] = useState(false);
  const setF = (patch) => { setFilters(patch); setPage(1); };
  useEffect(() => { setPage(1); }, [period.from, period.to]);

  // pilihan poli & dokter hanya dibutuhkan laporan resep
  const polis = useApi(() => (tab === 'prescriptions' ? yii.get('/polis', { limit: 100 }) : Promise.resolve(null)), []);
  const doctors = useApi(() => (tab === 'prescriptions' ? yii.get('/medical-staff', { staff_type: 'doctor', limit: 100 }) : Promise.resolve(null)), []);

  const query = { from: period.from, to: period.to, ...f };
  const report = useApi(() => node.get(cfg.path, { ...query, page, limit: 20 }), [JSON.stringify(query), page]);
  const { data } = report;

  const names = {
    poli: polis.data?.find((p) => String(p.id) === String(f.poli_id))?.name,
    doctor: doctors.data?.find((d) => String(d.id) === String(f.doctor_id))?.name,
  };
  const periodText = period.from === period.to ? tanggal(period.from) : `${tanggal(period.from)} sampai ${tanggal(period.to)}`;

  const exportCsv = async () => {
    setBusy(true);
    try { toast(`${await node.download(cfg.path, { ...query, format: 'csv' })} diunduh`); }
    catch (e) { toast(e.message, 'error'); }
    finally { setBusy(false); }
  };
  const print = () => printReport(async () => {
    const { data: all, meta } = await node.get(cfg.path, { ...query, page: 1, limit: 1000 });
    return {
      title: cfg.title,
      period: periodText,
      printedBy: user.full_name,
      filters: cfg.describe(f, names).filter(Boolean),
      summary: cfg.stats(all.summary).map(([l, v]) => [l, v]),
      columns: cfg.columns,
      rows: all.rows,
      note: [meta.total > all.rows.length && `Menampilkan ${num(all.rows.length)} dari ${num(meta.total)} baris. Unduh CSV untuk data lengkap.`, cfg.note].filter(Boolean).join(' '),
    };
  }).catch((e) => toast(e.message, 'error'));

  return (
    <>
      <PageHeader unit="dash" title="Laporan" subtitle="Rekap data pasien, stok obat, dan resep. Bisa dicetak, disimpan sebagai PDF, atau diunduh sebagai CSV untuk Excel."
        actions={<>
          <Button variant="secondary" icon={Printer} onClick={print} disabled={!data}>Cetak / PDF</Button>
          <Button variant="secondary" icon={Download} onClick={exportCsv} busy={busy} disabled={!data}>Unduh CSV</Button>
        </>} />

      <div className="mb-5">
        <Tabs tabs={tabs} value={tab} onChange={onTab} />
      </div>

      <PeriodFilter period={period}>
        {tab === 'patients' && <>
          <Select label="Dasar periode" value={f.basis} onChange={(e) => setF({ basis: e.target.value })} className="w-full sm:w-56">
            {Object.entries(BASIS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </Select>
          <Select label="Jenis kelamin" value={f.gender} onChange={(e) => setF({ gender: e.target.value })} className="w-full sm:w-40">
            <option value="">Semua</option>{Object.entries(GENDER).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </Select>
          <SearchBox value={f.q} onChange={(q) => setF({ q })} placeholder="Nama, No. RM, atau NIK" />
        </>}
        {tab === 'stock' && <>
          <Select label="Status stok" value={f.status} onChange={(e) => setF({ status: e.target.value })} className="w-full sm:w-40">
            <option value="">Semua</option>{Object.entries(STOCK_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </Select>
          <SearchBox value={f.q} onChange={(q) => setF({ q })} placeholder="Kode atau nama obat" />
        </>}
        {tab === 'prescriptions' && <>
          <Select label="Status" value={f.status} onChange={(e) => setF({ status: e.target.value })} className="w-[calc(50%-0.375rem)] sm:w-40">
            <option value="">Semua</option>{Object.entries(RX_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </Select>
          <Select label="Poli" value={f.poli_id} onChange={(e) => setF({ poli_id: e.target.value })} className="w-[calc(50%-0.375rem)] sm:w-44">
            <option value="">Semua poli</option>{polis.data?.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </Select>
          <Select label="Dokter" value={f.doctor_id} onChange={(e) => setF({ doctor_id: e.target.value })} className="w-full sm:w-56">
            <option value="">Semua dokter</option>{doctors.data?.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </Select>
        </>}
      </PeriodFilter>

      <ErrorBox error={report.error} onRetry={report.reload} />
      {!data ? (report.loading && <Spinner />) : (
        <>
          <StatGrid cols="md:grid-cols-3 2xl:grid-cols-6">
            {cfg.stats(data.summary).map(([label, value, strong, note]) => <Stat key={label} label={label} value={value} strong={strong} note={note} />)}
          </StatGrid>

          {tab === 'prescriptions' && <PrescriptionBreakdown summary={data.summary} />}

          <section className="panel">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3 sm:px-5">
              <h2 className="font-bold">Rincian {cfg.label.toLowerCase()}</h2>
              <span className="num text-[0.85rem] text-ink-soft">{num(report.meta?.total)} data, {periodText}</span>
            </div>
            {cfg.note && <p className="border-b border-line px-4 py-2 text-[0.85rem] text-ink-soft sm:px-5">{cfg.note}</p>}
            {!data.rows.length ? <Empty title="Tidak ada data untuk filter ini">Ubah periode atau filter di atas.</Empty> : (
              <>
                <p className="px-4 pt-2 text-[0.8rem] text-ink-faint xl:hidden">Geser tabel ke samping untuk melihat semua kolom.</p>
                <div className="overflow-x-auto">
                  <table className={`w-full ${cfg.minWidth} text-[0.92rem]`}>
                    <thead className="border-b border-line bg-wall/60">
                      <tr>{cfg.columns.map(([h, , align]) => <th key={h} className={`th whitespace-nowrap ${align === 'right' ? 'text-right' : ''}`}>{h}</th>)}</tr>
                    </thead>
                    <tbody className="divide-y divide-line">
                      {data.rows.map((r) => (
                        <tr key={r.id}>
                          {cfg.columns.map(([h, text, align, view]) => (
                            <td key={h} className={`td ${{ right: 'num whitespace-nowrap text-right', nowrap: 'num whitespace-nowrap' }[align] || ''}`}>{view ? view(r) : text(r)}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
            <Pagination meta={report.meta} onPage={setPage} />
          </section>
        </>
      )}
    </>
  );
}

/** Kotak pencarian dengan jeda 350 ms agar tidak memanggil API di setiap ketikan. */
function SearchBox({ value, onChange, placeholder }) {
  const [text, setText] = useState(value);
  useEffect(() => { setText(value); }, [value]);
  useEffect(() => {
    if (text === value) return undefined;
    const t = setTimeout(() => onChange(text.trim()), 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);
  return <Input label="Cari" type="search" value={text} onChange={(e) => setText(e.target.value)} placeholder={placeholder} className="w-full sm:w-64" />;
}

function PrescriptionBreakdown({ summary }) {
  return (
    <div className="mb-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
      <section className="panel">
        <h2 className="border-b border-line px-4 py-3 font-bold sm:px-5">Resep per dokter</h2>
        {!summary.by_doctor.length ? <Empty title="Belum ada resep" /> : (
          <div className="overflow-x-auto">
            <table className="w-full text-[0.92rem]">
              <thead className="border-b border-line bg-wall/60"><tr><th className="th">Dokter</th><th className="th text-right">Resep</th><th className="th text-right">Diserahkan</th></tr></thead>
              <tbody className="divide-y divide-line">
                {summary.by_doctor.map((d) => (
                  <tr key={`${d.doctor}-${d.poli}`}>
                    <td className="td">{d.doctor}<p className="text-[0.82rem] text-ink-soft">{d.poli}</p></td>
                    <td className="td num text-right font-semibold">{num(d.total)}</td>
                    <td className="td num text-right">{num(d.dispensed)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <section className="panel">
        <h2 className="border-b border-line px-4 py-3 font-bold sm:px-5">Obat paling banyak diresepkan</h2>
        {!summary.top_medicines.length ? <Empty title="Belum ada obat yang diresepkan" /> : (
          <div className="overflow-x-auto">
            <table className="w-full text-[0.92rem]">
              <thead className="border-b border-line bg-wall/60"><tr><th className="th">Obat</th><th className="th text-right">Jumlah</th><th className="th text-right">Resep</th></tr></thead>
              <tbody className="divide-y divide-line">
                {summary.top_medicines.map((m, i) => (
                  <tr key={m.code}>
                    <td className="td"><span className="flex items-center gap-2">{i === 0 && <Badge tone="done">Terbanyak</Badge>}{m.name}</span></td>
                    <td className="td num text-right font-semibold">{num(m.total_qty)} {m.unit}</td>
                    <td className="td num text-right">{num(m.prescriptions)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

import { useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { CheckCircle2, CircleDashed, CircleDot, RefreshCw } from 'lucide-react';
import { node, yii } from '../api/client';
import { PageHeader } from '../components/Layout';
import { Button, Empty, ErrorBox, Input, Pagination, Select, Spinner, StatusBadge } from '../components/ui';
import { INVOICE_STATUS, num, rupiah, shiftDate, tanggal, today, VISIT_STATUS } from '../lib/format';
import { useApi } from '../lib/useApi';

// Palet grafik (divalidasi dataviz/validate_palette.js: chroma, CVD ΔE ≥ 8, kontras ≥ 3:1).
// Sengaja tidak memakai warna status (amber/biru/hijau/merah) agar tidak tertukar makna.
const SERIES = { cash: '#00897B', non_cash: '#7B4BB0' };
const AXIS = { stroke: '#7C8E8B', fontSize: 12 };

const PRESETS = [
  { key: 'today', label: 'Hari ini', range: () => [today(), today()] },
  { key: '7d', label: '7 hari', range: () => [shiftDate(today(), -6), today()] },
  { key: '30d', label: '30 hari', range: () => [shiftDate(today(), -29), today()] },
  { key: 'month', label: 'Bulan ini', range: () => [`${today().slice(0, 8)}01`, today()] },
];

const short = (n) => (n >= 1e6 ? `${(n / 1e6).toLocaleString('id-ID', { maximumFractionDigits: 1 })} jt` : n >= 1e3 ? `${Math.round(n / 1e3)} rb` : `${n}`);

export default function Dashboard() {
  const [preset, setPreset] = useState('30d');
  const [range, setRange] = useState(PRESETS[2].range());
  const [from, to] = range;
  const q = { from, to };
  const summary = useApi(() => node.get('/dashboard/summary', q), [from, to]);
  const revenue = useApi(() => node.get('/dashboard/revenue', q), [from, to]);
  const procedures = useApi(() => node.get('/dashboard/procedures', q), [from, to]);
  const meds = useApi(() => node.get('/dashboard/medicine-usage', q), [from, to]);

  const pick = (p) => { setPreset(p.key); setRange(p.range()); };
  const reloadAll = () => [summary, revenue, procedures, meds].forEach((x) => x.reload());
  const s = summary.data;

  return (
    <>
      <PageHeader unit="dash" title="Dashboard pelayanan" subtitle="Data dari services-node (read-only). Pendapatan dihitung dari pembayaran yang diterima pada periode, dikurangi refund."
        actions={<Button variant="secondary" icon={RefreshCw} onClick={reloadAll}>Muat ulang</Button>} />

      {/* filter periode: satu baris di atas semua grafik */}
      <div className="mb-6 flex flex-wrap items-end gap-3">
        <div className="flex rounded-md border border-line-strong bg-white p-0.5" role="group" aria-label="Periode cepat">
          {PRESETS.map((p) => (
            <button key={p.key} onClick={() => pick(p)} aria-pressed={preset === p.key}
              className={`rounded px-3 py-1.5 text-[0.9rem] font-semibold ${preset === p.key ? 'bg-rs text-white' : 'text-ink-soft hover:bg-wall'}`}>{p.label}</button>
          ))}
        </div>
        <Input label="Dari" type="date" value={from} max={to} onChange={(e) => { setPreset(''); setRange([e.target.value, to]); }} className="w-44" />
        <Input label="Sampai" type="date" value={to} min={from} onChange={(e) => { setPreset(''); setRange([from, e.target.value]); }} className="w-44" />
      </div>

      <ErrorBox error={summary.error} onRetry={reloadAll} />
      {summary.loading && !s ? <Spinner /> : s && (
        <>
          <section className="mb-6 grid grid-cols-2 gap-px overflow-hidden rounded-panel border border-line bg-line md:grid-cols-5" aria-label="Ringkasan">
            <Stat label="Kunjungan" value={num(s.total_visits)} />
            <Stat label="Tindakan medis" value={num(s.total_procedures)} />
            <Stat label="Pendapatan diterima" value={rupiah(s.revenue_received)} strong />
            <Stat label="Total tagihan" value={rupiah(s.revenue_invoiced)} />
            <Stat label="Obat keluar" value={`${num(s.medicine_units_dispensed)} unit`} />
          </section>

          <div className="grid gap-6 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
            <RevenueChart data={revenue.data} loading={revenue.loading} />
            <PaymentStatus rows={s.payment_status} />
            <VisitsByPoli rows={s.visits_by_poli} />
            <RankTable title="Tindakan terbanyak" rows={procedures.data} cols={[['name', 'Tindakan'], ['total_qty', 'Jumlah', num], ['total_amount', 'Nilai', rupiah]]} metric="total_qty" />
            <RankTable title="Rekap penggunaan obat" rows={meds.data} cols={[['name', 'Obat'], ['total_qty', 'Keluar', (v, r) => `${num(v)} ${r.unit}`], ['current_stock', 'Sisa stok', num]]} metric="total_qty" />
          </div>
          <VisitDetails from={from} to={to} />
        </>
      )}
    </>
  );
}

const Stat = ({ label, value, strong }) => (
  <div className="bg-white px-5 py-4">
    <p className="text-[0.85rem] text-ink-soft">{label}</p>
    <p className={`num mt-1 font-extrabold leading-tight ${strong ? 'text-[1.6rem] text-rs' : 'text-[1.4rem]'}`}>{value}</p>
  </div>
);

function Panel({ title, children, className = '', right }) {
  return (
    <section className={`panel ${className}`}>
      <h2 className="flex items-center justify-between border-b border-line px-5 py-3 font-bold">{title}{right}</h2>
      <div className="px-5 py-4">{children}</div>
    </section>
  );
}

function ChartTooltip({ active, payload, label, fmt }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-md border border-line bg-white px-3 py-2 text-[0.85rem] shadow-lg">
      <p className="mb-1 font-semibold">{label}</p>
      {payload.map((p) => (
        <p key={p.dataKey} className="num flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: p.color }} />{p.name}: <b>{fmt(p.value)}</b></p>
      ))}
    </div>
  );
}

function RevenueChart({ data, loading }) {
  const rows = useMemo(() => (data || []).map((r) => ({ ...r, label: tanggal(r.date).replace(/ \d{4}$/, '') })), [data]);
  const totals = rows.reduce((a, r) => ({ cash: a.cash + r.cash, non_cash: a.non_cash + r.non_cash }), { cash: 0, non_cash: 0 });
  return (
    <Panel title="Pendapatan harian" className="xl:row-span-1"
      right={<div className="flex gap-4 text-[0.85rem] font-normal">
        {[['cash', 'Tunai'], ['non_cash', 'Non-tunai']].map(([k, l]) => (
          <span key={k} className="num flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: SERIES[k] }} />{l} <b>{rupiah(totals[k])}</b></span>
        ))}
      </div>}>
      {loading && !data ? <Spinner /> : !rows.length ? <Empty title="Belum ada pembayaran pada periode ini" /> : (
        <div className="h-64">
          <ResponsiveContainer>
            <BarChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} barCategoryGap="25%" maxBarSize={56}>
              <CartesianGrid vertical={false} stroke="#E6ECEA" />
              <XAxis dataKey="label" tick={AXIS} tickLine={false} axisLine={{ stroke: '#D3DDDA' }} />
              <YAxis tick={AXIS} tickLine={false} axisLine={false} tickFormatter={short} width={48} />
              <Tooltip content={<ChartTooltip fmt={rupiah} />} cursor={{ fill: 'rgba(23,50,48,0.05)' }} />
              <Bar dataKey="cash" name="Tunai" stackId="r" fill={SERIES.cash} stroke="#fff" strokeWidth={2} />
              <Bar dataKey="non_cash" name="Non-tunai" stackId="r" fill={SERIES.non_cash} stroke="#fff" strokeWidth={2} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </Panel>
  );
}

const STATUS_VIEW = {
  unpaid: { icon: CircleDashed, bar: 'bg-st-danger' },
  partial: { icon: CircleDot, bar: 'bg-st-wait' },
  paid: { icon: CheckCircle2, bar: 'bg-st-done' },
};
function PaymentStatus({ rows }) {
  const byStatus = Object.fromEntries((rows || []).map((r) => [r.status, r]));
  const total = (rows || []).reduce((a, r) => a + r.invoices, 0);
  return (
    <Panel title="Status pembayaran">
      {!total ? <Empty title="Belum ada tagihan" /> : (
        <ul className="space-y-4">
          {['unpaid', 'partial', 'paid'].map((k) => {
            const r = byStatus[k] || { invoices: 0, total_amount: 0, paid_amount: 0 };
            const V = STATUS_VIEW[k];
            return (
              <li key={k}>
                <div className="flex items-center justify-between text-[0.92rem]">
                  <span className="flex items-center gap-2 font-semibold"><V.icon className="h-4 w-4 text-ink-soft" aria-hidden />{INVOICE_STATUS[k].label}</span>
                  <span className="num"><b>{r.invoices}</b> tagihan · {rupiah(k === 'paid' ? r.paid_amount : r.total_amount - r.paid_amount)}{k !== 'paid' && ' belum masuk'}</span>
                </div>
                <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-wall" role="img" aria-label={`${r.invoices} dari ${total} tagihan`}>
                  <div className={`h-full rounded-full ${V.bar}`} style={{ width: `${(r.invoices / total) * 100}%` }} />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}

function VisitsByPoli({ rows }) {
  const data = rows || [];
  return (
    <Panel title="Kunjungan per poli">
      {!data.length ? <Empty title="Belum ada kunjungan" /> : (
        <div style={{ height: Math.max(120, data.length * 44) }}>
          <ResponsiveContainer>
            <BarChart data={data} layout="vertical" margin={{ top: 0, right: 40, bottom: 0, left: 0 }} barCategoryGap="30%">
              <XAxis type="number" hide allowDecimals={false} />
              <YAxis type="category" dataKey="poli" tick={{ ...AXIS, fill: '#173230' }} tickLine={false} axisLine={false} width={96} />
              <Tooltip content={<ChartTooltip fmt={(v) => `${num(v)} kunjungan`} />} cursor={{ fill: 'rgba(23,50,48,0.05)' }} />
              <Bar dataKey="visits" name="Kunjungan" fill={SERIES.cash} radius={[0, 4, 4, 0]}>
                <LabelList dataKey="visits" position="right" style={{ fill: '#173230', fontSize: 13, fontWeight: 700 }} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </Panel>
  );
}

function RankTable({ title, rows, cols, metric }) {
  const max = Math.max(1, ...(rows || []).map((r) => r[metric]));
  return (
    <Panel title={title}>
      {!rows?.length ? <Empty title="Belum ada data" /> : (
        <table className="w-full text-[0.9rem]">
          <thead><tr>{cols.map(([k, l], i) => <th key={k} className={`pb-2 text-left text-[0.8rem] font-semibold text-ink-soft ${i ? 'text-right' : ''}`}>{l}</th>)}</tr></thead>
          <tbody>
            {rows.slice(0, 8).map((r, idx) => (
              <tr key={idx} className="border-t border-line">
                {cols.map(([k, , fmt], i) => (
                  <td key={k} className={`py-2 ${i ? 'num text-right' : ''}`}>
                    {i === 0 ? (<><span>{r[k]}</span><span className="mt-1 block h-1 rounded-full bg-wall"><span className="block h-1 rounded-full" style={{ width: `${(r[metric] / max) * 100}%`, background: SERIES.cash }} /></span></>)
                      : fmt ? fmt(r[k], r) : r[k]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Panel>
  );
}

function VisitDetails({ from, to }) {
  const [f, setF] = useState({ poli_id: '', payment_status: '', page: 1 });
  const polis = useApi(() => yii.get('/polis', { limit: 100 }), []);
  const r = useApi(() => node.get('/dashboard/details/visits', { from, to, ...f, limit: 15 }), [from, to, JSON.stringify(f)]);
  return (
    <section className="panel mt-6">
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-line px-5 py-3">
        <h2 className="font-bold">Rincian kunjungan</h2>
        <div className="flex flex-wrap gap-2">
          <Select aria-label="Filter poli" value={f.poli_id} onChange={(e) => setF({ ...f, poli_id: e.target.value, page: 1 })}>
            <option value="">Semua poli</option>{polis.data?.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </Select>
          <Select aria-label="Filter status bayar" value={f.payment_status} onChange={(e) => setF({ ...f, payment_status: e.target.value, page: 1 })}>
            <option value="">Semua status bayar</option>{Object.entries(INVOICE_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </Select>
        </div>
      </div>
      <ErrorBox error={r.error} />
      {r.loading && !r.data ? <div className="px-5"><Spinner /></div> : !r.data?.length ? <Empty title="Tidak ada kunjungan untuk filter ini" /> : (
        <div className="overflow-x-auto">
          <table className="w-full text-[0.92rem]">
            <thead className="border-b border-line bg-wall/60"><tr><th className="th">Tanggal</th><th className="th">Pasien</th><th className="th">Poli / dokter</th><th className="th">Kunjungan</th><th className="th">Invoice</th><th className="th text-right">Total</th><th className="th text-right">Dibayar</th></tr></thead>
            <tbody className="divide-y divide-line">
              {r.data.map((v) => (
                <tr key={v.id}>
                  <td className="td num">{tanggal(v.visit_date)}</td>
                  <td className="td">{v.patient_name}<p className="num text-[0.85rem] text-ink-soft">{v.medical_record_no}</p></td>
                  <td className="td">{v.poli}<p className="text-[0.85rem] text-ink-soft">{v.doctor}</p></td>
                  <td className="td"><StatusBadge map={VISIT_STATUS} value={v.status} /></td>
                  <td className="td">{v.invoice_no ? <><p className="num">{v.invoice_no}</p><StatusBadge map={INVOICE_STATUS} value={v.payment_status} /></> : '-'}</td>
                  <td className="td num text-right">{rupiah(v.total_amount)}</td>
                  <td className="td num text-right">{rupiah(v.paid_amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Pagination meta={r.meta} onPage={(page) => setF({ ...f, page })} />
    </section>
  );
}

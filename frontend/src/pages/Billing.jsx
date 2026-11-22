import { useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Banknote, Printer, RotateCcw, Search } from 'lucide-react';
import { newIdempotencyKey, yii } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { PageHeader } from '../components/Layout';
import { Badge, Button, Empty, ErrorBox, Input, Modal, Pagination, Select, Spinner, StatusBadge, Tabs, Textarea, useToast } from '../components/ui';
import { INVOICE_STATUS, rupiah, shiftDate, tanggal, today, waktu } from '../lib/format';
import { openPrint } from '../lib/print';
import { useApi } from '../lib/useApi';

/* ================= daftar tagihan ================= */
export function InvoiceList() {
  const [f, setF] = useState({ status: 'unpaid', from: shiftDate(today(), -6), to: today(), q: '', page: 1 });
  const list = useApi(() => yii.get('/invoices', { ...f, limit: 20 }), [JSON.stringify(f)]);
  return (
    <>
      <PageHeader unit="cash" title="Tagihan & pembayaran" subtitle="Semua biaya pelayanan pasien tergabung otomatis dalam satu tagihan per kunjungan." />
      <div className="panel">
        <div className="flex flex-wrap items-end gap-3 border-b border-line p-4">
          <Input label="Dari" type="date" value={f.from} onChange={(e) => setF({ ...f, from: e.target.value, page: 1 })} className="w-44" />
          <Input label="Sampai" type="date" value={f.to} onChange={(e) => setF({ ...f, to: e.target.value, page: 1 })} className="w-44" />
          <label className="relative min-w-[16rem] flex-1">
            <span className="mb-1 block text-[0.85rem] font-semibold text-ink-soft">Cari</span>
            <Search className="pointer-events-none absolute bottom-3 left-3 h-4 w-4 text-ink-faint" />
            <input className="field-input pl-9" placeholder="No. invoice, nama, atau no. RM" value={f.q} onChange={(e) => setF({ ...f, q: e.target.value, page: 1 })} />
          </label>
        </div>
        <div className="px-4"><Tabs value={f.status} onChange={(status) => setF({ ...f, status, page: 1 })}
          tabs={[{ value: 'unpaid', label: 'Belum dibayar' }, { value: 'partial', label: 'Dibayar sebagian' }, { value: 'paid', label: 'Lunas' }, { value: '', label: 'Semua' }]} /></div>
        <ErrorBox error={list.error} onRetry={list.reload} />
        {list.loading && !list.data ? <div className="px-4"><Spinner /></div> : !list.data?.length ? <Empty title="Tidak ada tagihan">Ubah filter tanggal atau status.</Empty> : (
          <div className="overflow-x-auto">
            <table className="w-full text-[0.93rem]">
              <thead className="border-b border-line bg-wall/60"><tr><th className="th">Invoice</th><th className="th">Pasien</th><th className="th">Kunjungan</th><th className="th text-right">Total</th><th className="th text-right">Sisa</th><th className="th">Status</th></tr></thead>
              <tbody className="divide-y divide-line">
                {list.data.map((i) => (
                  <tr key={i.id} className="hover:bg-wall/60">
                    <td className="td"><Link to={`/kasir/${i.id}`} className="num font-semibold hover:underline">{i.invoice_no}</Link>{i.revision > 1 && <span className="num ml-2 text-[0.8rem] text-ink-faint">rev. {i.revision}</span>}</td>
                    <td className="td">{i.patient_name}<p className="num text-[0.85rem] text-ink-soft">{i.medical_record_no}</p></td>
                    <td className="td num">{tanggal(i.visit_date)}</td>
                    <td className="td num text-right">{rupiah(i.total_amount)}</td>
                    <td className={`td num text-right font-semibold ${i.balance > 0 ? 'text-st-danger' : ''}`}>{i.overpaid_amount > 0 ? <span className="text-st-wait">lebih {rupiah(i.overpaid_amount)}</span> : rupiah(i.balance)}</td>
                    <td className="td"><StatusBadge map={INVOICE_STATUS} value={i.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pagination meta={list.meta} onPage={(page) => setF({ ...f, page })} />
      </div>
    </>
  );
}

/* ================= detail tagihan ================= */
const GROUPS = [['registration', 'Pendaftaran'], ['procedure', 'Tindakan medis'], ['lab', 'Pemeriksaan penunjang'], ['medicine', 'Obat']];

export function InvoiceDetail() {
  const { id } = useParams();
  const { can } = useAuth();
  const toast = useToast();
  const inv = useApi(() => yii.get(`/invoices/${id}`), [id]);
  const [payOpen, setPayOpen] = useState(false);
  const [refundOpen, setRefundOpen] = useState(false);
  const print = (path) => openPrint(path).catch((e) => toast(e.message, 'error'));

  if (inv.loading && !inv.data) return <Spinner />;
  if (inv.error) return <ErrorBox error={inv.error} onRetry={inv.reload} />;
  const d = inv.data;
  const v = d.visit;

  return (
    <>
      <Link to="/kasir" className="mb-4 inline-flex items-center gap-1.5 text-[0.9rem] text-ink-soft hover:text-ink"><ArrowLeft className="h-4 w-4" /> Daftar tagihan</Link>
      <PageHeader unit="cash" title={d.invoice_no} subtitle={`${v.patient.name} · ${v.patient.medical_record_no} · ${v.poli_name}, ${tanggal(v.visit_date)} · antrean ${v.queue_code}`}
        actions={<>
          <Button variant="secondary" icon={Printer} onClick={() => print(`/invoices/${d.id}/print`)}>Cetak invoice</Button>
          {can('payment.create') && d.overpaid_amount > 0 && <Button variant="secondary" icon={RotateCcw} onClick={() => setRefundOpen(true)}>Refund kelebihan</Button>}
          {can('payment.create') && d.balance > 0 && <Button icon={Banknote} onClick={() => setPayOpen(true)}>Terima pembayaran</Button>}
        </>} />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <section className="panel">
          <h2 className="flex items-center justify-between border-b border-line px-5 py-3 font-bold">Rincian biaya
            <span className="text-[0.85rem] font-normal text-ink-soft"><StatusBadge map={INVOICE_STATUS} value={d.status} /> <span className="num ml-2">revisi {d.revision}</span></span></h2>
          <table className="w-full text-[0.93rem]">
            <tbody>
              {GROUPS.map(([type, label]) => {
                const items = d.items.filter((i) => i.item_type === type);
                if (!items.length) return null;
                return [
                  <tr key={type} className="bg-wall/60"><td colSpan={3} className="px-5 py-1.5 text-[0.85rem] font-semibold text-ink-soft">{label}</td><td className="num px-5 py-1.5 text-right text-[0.85rem] font-semibold text-ink-soft">{rupiah(d.summary[type])}</td></tr>,
                  ...items.map((i) => (
                    <tr key={i.id} className={`border-b border-line ${i.voided_at ? 'text-ink-faint' : ''}`}>
                      <td className="px-5 py-2"><span className={i.voided_at ? 'line-through' : ''}>{i.description}</span>{i.voided_at && <p className="text-[0.82rem]">Dibatalkan: {i.void_reason}</p>}</td>
                      <td className="num px-2 py-2 text-right">{i.quantity}×</td>
                      <td className="num px-2 py-2 text-right">{rupiah(i.unit_price)}</td>
                      <td className={`num px-5 py-2 text-right ${i.voided_at ? 'line-through' : ''}`}>{rupiah(i.subtotal)}</td>
                    </tr>
                  )),
                ];
              })}
            </tbody>
          </table>
          <dl className="num ml-auto max-w-sm space-y-1.5 px-5 py-4 text-[0.95rem]">
            <div className="flex justify-between"><dt>Total tagihan</dt><dd className="font-bold">{rupiah(d.total_amount)}</dd></div>
            <div className="flex justify-between text-ink-soft"><dt>Sudah dibayar</dt><dd>{rupiah(d.paid_amount)}</dd></div>
            {d.overpaid_amount > 0
              ? <div className="flex justify-between border-t-2 border-ink pt-2 text-lg font-extrabold text-st-wait"><dt>Kelebihan bayar</dt><dd>{rupiah(d.overpaid_amount)}</dd></div>
              : <div className={`flex justify-between border-t-2 border-ink pt-2 text-lg font-extrabold ${d.balance > 0 ? 'text-st-danger' : 'text-st-done'}`}><dt>Sisa tagihan</dt><dd>{rupiah(d.balance)}</dd></div>}
          </dl>
        </section>

        <section className="panel self-start">
          <h2 className="border-b border-line px-5 py-3 font-bold">Riwayat pembayaran</h2>
          {!d.payments.length ? <Empty title="Belum ada pembayaran" /> : (
            <ul className="divide-y divide-line">
              {d.payments.map((p) => (
                <li key={p.id} className="flex items-center gap-3 px-5 py-3">
                  <div className="flex-1">
                    <p className="num font-semibold">{p.receipt_no} {p.kind === 'refund' && <Badge tone="wait">refund</Badge>}</p>
                    <p className="text-[0.85rem] text-ink-soft"><span className="num">{waktu(p.paid_at)}</span> · {p.method === 'cash' ? 'Tunai' : `Non-tunai ${String(p.channel).toUpperCase()}`}{p.reference_no && <span className="num"> · {p.reference_no}</span>}</p>
                  </div>
                  <p className={`num font-bold ${p.kind === 'refund' ? 'text-st-wait' : ''}`}>{p.kind === 'refund' ? '−' : ''}{rupiah(p.amount)}</p>
                  <Button size="sm" variant="ghost" icon={Printer} aria-label={`Cetak bukti ${p.receipt_no}`} onClick={() => print(`/payments/${p.id}/receipt`)} />
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {payOpen && <PaymentModal invoice={d} onClose={() => setPayOpen(false)} onDone={(res) => { setPayOpen(false); inv.reload(); toast(res.meta?.replayed ? 'Pembayaran ini sudah tercatat sebelumnya' : `Pembayaran ${res.data.payment.receipt_no} tercatat`); }} />}
      {refundOpen && <PaymentModal refund invoice={d} onClose={() => setRefundOpen(false)} onDone={() => { setRefundOpen(false); inv.reload(); toast('Refund tercatat'); }} />}
    </>
  );
}

/**
 * Form bayar / refund. Idempotency-Key dibuat SEKALI saat form dibuka:
 * bila jaringan putus dan kasir menekan tombol lagi, kunci yang sama dikirim ulang
 * sehingga backend tidak mencatat pembayaran dua kali (skenario D3).
 */
function PaymentModal({ invoice, refund = false, onClose, onDone }) {
  const max = refund ? invoice.overpaid_amount : invoice.balance;
  const [form, setForm] = useState({ amount: String(max), method: 'cash', channel: 'qris', reason: '' });
  const [received, setReceived] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const keyRef = useRef(newIdempotencyKey(refund ? 'refund' : 'pay'));
  const errors = error?.fieldErrors?.() || {};
  const change = useMemo(() => (form.method === 'cash' && received ? Number(received) - Number(form.amount || 0) : null), [received, form]);
  const set = (k) => (e) => { keyRef.current = newIdempotencyKey(refund ? 'refund' : 'pay'); setForm({ ...form, [k]: e.target.value }); };

  const submit = async () => {
    setBusy(true); setError(null);
    const body = { amount: Number(form.amount), method: form.method, ...(form.method === 'non_cash' ? { channel: form.channel } : {}), ...(refund ? { reason: form.reason } : {}) };
    try {
      const res = await yii.post(`/invoices/${invoice.id}/${refund ? 'refunds' : 'payments'}`, body, { headers: { 'Idempotency-Key': keyRef.current } });
      onDone(res);
    } catch (e) { setError(e); setBusy(false); }
  };

  return (
    <Modal open title={refund ? 'Refund kelebihan bayar' : 'Terima pembayaran'} onClose={onClose}
      footer={<><Button variant="secondary" onClick={onClose}>Batal</Button><Button busy={busy} onClick={submit}>{refund ? 'Catat refund' : `Catat pembayaran ${rupiah(form.amount)}`}</Button></>}>
      <p className="num mb-4 rounded-md bg-wall px-4 py-3 text-[0.95rem]">{refund ? 'Kelebihan bayar' : 'Sisa tagihan'}: <b>{rupiah(max)}</b> dari total {rupiah(invoice.total_amount)}</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <Input label={refund ? 'Jumlah refund' : 'Jumlah dibayar'} type="number" min={1} max={max} value={form.amount} onChange={set('amount')} error={errors.amount}
          hint={!refund && 'Boleh kurang dari sisa tagihan (pembayaran bertahap)'} className="sm:col-span-2" />
        <Select label="Metode" value={form.method} onChange={set('method')} error={errors.method}>
          <option value="cash">Tunai</option><option value="non_cash">Non-tunai (simulasi)</option>
        </Select>
        {form.method === 'non_cash' ? (
          <Select label="Channel" value={form.channel} onChange={set('channel')} error={errors.channel}>
            <option value="qris">QRIS</option><option value="debit">Kartu debit</option><option value="credit">Kartu kredit</option><option value="transfer">Transfer bank</option>
          </Select>
        ) : !refund && (
          <Input label="Uang diterima (opsional)" type="number" value={received} onChange={(e) => setReceived(e.target.value)}
            hint={change !== null ? (change >= 0 ? `Kembalian ${rupiah(change)}` : `Kurang ${rupiah(-change)}`) : undefined} />
        )}
        {refund && <Textarea label="Alasan refund" rows={2} value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} className="sm:col-span-2" />}
      </div>
      {error && <div className="mt-3"><ErrorBox error={error} /></div>}
      {error?.code === 'NETWORK_ERROR' && <p className="mt-2 text-[0.85rem] text-ink-soft">Tekan tombol lagi untuk mencoba ulang. Pembayaran tidak akan tercatat dua kali.</p>}
    </Modal>
  );
}

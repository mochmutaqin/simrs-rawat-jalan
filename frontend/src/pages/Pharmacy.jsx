import { useEffect, useState } from 'react';
import { ClipboardCheck, PackagePlus, Pencil, Plus, RefreshCw, SlidersHorizontal, XCircle } from 'lucide-react';
import { yii } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { PageHeader } from '../components/Layout';
import { Badge, Button, Empty, ErrorBox, Input, Modal, Pagination, QueueTicket, Select, Spinner, StatusBadge, Tabs, Textarea, useToast } from '../components/ui';
import { num, rupiah, RX_STATUS, today, umur, waktu } from '../lib/format';
import { useApi } from '../lib/useApi';
import { ReasonModal } from './Examination';

/* ================= resep masuk ================= */
export function PrescriptionQueue() {
  const toast = useToast();
  const [status, setStatus] = useState('pending');
  const [date, setDate] = useState(today());
  const [page, setPage] = useState(1);
  const [dispensing, setDispensing] = useState(null);
  const [cancelling, setCancelling] = useState(null);
  const list = useApi(() => yii.get('/prescriptions', { status, date, page, limit: 20 }), [status, date, page]);
  useEffect(() => { const t = setInterval(list.reload, 20000); return () => clearInterval(t); }, [list.reload]);

  return (
    <>
      <PageHeader unit="pharm" title="Resep masuk" subtitle="Siapkan obat, lalu tandai diserahkan. Stok berkurang dan biaya obat masuk tagihan pasien."
        actions={<><Input type="date" value={date} onChange={(e) => { setDate(e.target.value); setPage(1); }} aria-label="Tanggal" /><Button variant="secondary" icon={RefreshCw} onClick={list.reload}>Muat ulang</Button></>} />
      <Tabs value={status} onChange={(s) => { setStatus(s); setPage(1); }} tabs={[{ value: 'pending', label: 'Menunggu' }, { value: 'dispensed', label: 'Diserahkan' }, { value: 'cancelled', label: 'Batal' }]} />
      <div className="mt-4"><ErrorBox error={list.error} onRetry={list.reload} /></div>
      {list.loading && !list.data ? <Spinner /> : !list.data?.length ? <Empty title="Tidak ada resep">Resep dari dokter akan muncul di sini.</Empty> : (
        <div className="grid gap-4 lg:grid-cols-2">
          {list.data.map((rx) => (
            <article key={rx.id} className="panel">
              <header className="flex items-center gap-3 border-b border-line px-4 py-3">
                <QueueTicket code={rx.visit.queue_code} tone={rx.status === 'pending' ? 'wait' : 'done'} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-bold">{rx.visit.patient.name}</p>
                  <p className="num text-[0.85rem] text-ink-soft">{rx.visit.patient.medical_record_no} · {umur(rx.visit.patient.birth_date)} · {rx.visit.doctor_name}</p>
                </div>
                <StatusBadge map={RX_STATUS} value={rx.status} />
              </header>
              <table className="w-full text-[0.92rem]"><tbody className="divide-y divide-line">
                {rx.items.map((it) => (
                  <tr key={it.id}><td className="px-4 py-2"><p className="font-semibold">{it.medicine_name}</p><p className="text-[0.85rem] text-ink-soft">{it.dose} · {it.frequency}{it.instructions ? ` · ${it.instructions}` : ''}</p></td>
                    <td className="num px-4 py-2 text-right">{it.quantity} {it.unit}</td><td className="num px-4 py-2 text-right text-ink-soft">{rupiah(it.subtotal)}</td></tr>
                ))}
              </tbody></table>
              <footer className="flex items-center justify-between gap-2 border-t border-line bg-wall/50 px-4 py-2.5">
                <span className="num font-semibold">{rupiah(rx.total)}</span>
                {rx.status === 'pending' ? (
                  <div className="flex gap-2">
                    <Button size="sm" variant="ghost" icon={XCircle} onClick={() => setCancelling(rx)}>Batalkan</Button>
                    <Button size="sm" icon={ClipboardCheck} onClick={() => setDispensing(rx)}>Serahkan obat</Button>
                  </div>
                ) : <span className="text-[0.85rem] text-ink-soft">{rx.dispensed_at && `Diserahkan ${waktu(rx.dispensed_at)}`}</span>}
              </footer>
            </article>
          ))}
        </div>
      )}
      <div className="mt-4 panel empty:hidden"><Pagination meta={list.meta} onPage={setPage} /></div>

      {dispensing && <DispenseModal rx={dispensing} onClose={() => setDispensing(null)} onDone={() => { setDispensing(null); list.reload(); toast('Obat diserahkan, stok diperbarui'); }} />}
      {cancelling && <ReasonModal title={`Batalkan resep #${cancelling.id}`} confirm="Batalkan resep" onClose={() => setCancelling(null)}
        onSubmit={async (reason) => { await yii.post(`/prescriptions/${cancelling.id}/cancel`, { reason }); setCancelling(null); list.reload(); toast('Resep dibatalkan'); }} />}
    </>
  );
}

function DispenseModal({ rx, onClose, onDone }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const go = async () => {
    setBusy(true); setError(null);
    try { await yii.post(`/prescriptions/${rx.id}/dispense`); onDone(); }
    catch (e) { setError(e); setBusy(false); }
  };
  return (
    <Modal open title={`Serahkan obat untuk ${rx.visit.patient.name}`} onClose={onClose}
      footer={<><Button variant="secondary" onClick={onClose}>Kembali</Button><Button busy={busy} icon={ClipboardCheck} onClick={go}>Ya, serahkan obat</Button></>}>
      <p className="text-[0.92rem] text-ink-soft">Pastikan obat sudah disiapkan dan dicek. Semua item diserahkan sekaligus; bila salah satu stoknya kurang, tidak ada stok yang berubah.</p>
      <ul className="mt-3 divide-y divide-line rounded-md border border-line text-[0.92rem]">
        {rx.items.map((it) => <li key={it.id} className="flex justify-between px-3 py-2"><span>{it.medicine_name}</span><span className="num">{it.quantity} {it.unit}</span></li>)}
      </ul>
      {error && <div className="mt-3"><ErrorBox error={error} /></div>}
    </Modal>
  );
}

/* ================= stok obat ================= */
export function MedicineStock() {
  const toast = useToast();
  const { can } = useAuth();
  const [q, setQ] = useState('');
  const [low, setLow] = useState(false);
  const [page, setPage] = useState(1);
  const [stockFor, setStockFor] = useState(null);
  const [cardFor, setCardFor] = useState(null);
  const [editing, setEditing] = useState(null);
  const list = useApi(() => yii.get('/medicines', { q, page, limit: 20, ...(low ? { low_stock: 1 } : {}) }), [q, page, low]);

  return (
    <>
      <PageHeader unit="pharm" title="Stok obat" subtitle="Stok hanya berubah lewat penerimaan, penyesuaian, atau penyerahan resep, sehingga setiap perubahan punya jejak."
        actions={can('medicine.manage') && <Button icon={Plus} onClick={() => setEditing({})}>Obat baru</Button>} />
      <div className="panel">
        <div className="flex flex-wrap items-end gap-3 border-b border-line p-4">
          <Input placeholder="Cari kode atau nama obat" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} className="min-w-[16rem] flex-1" />
          <label className="flex items-center gap-2 pb-2 text-[0.92rem]"><input type="checkbox" checked={low} onChange={(e) => { setLow(e.target.checked); setPage(1); }} className="accent-rs" /> Hanya stok menipis</label>
        </div>
        <ErrorBox error={list.error} />
        {list.loading && !list.data ? <div className="px-4"><Spinner /></div> : !list.data?.length ? <Empty title="Obat tidak ditemukan" /> : (
          <div className="overflow-x-auto">
            <table className="w-full text-[0.93rem]">
              <thead className="border-b border-line bg-wall/60"><tr><th className="th">Kode</th><th className="th">Nama obat</th><th className="th text-right">Stok</th><th className="th text-right">Minimum</th><th className="th text-right">Harga</th><th className="th" /></tr></thead>
              <tbody className="divide-y divide-line">
                {list.data.map((m) => (
                  <tr key={m.id} className={m.is_active ? '' : 'text-ink-faint'}>
                    <td className="td num">{m.code}</td>
                    <td className="td font-semibold">{m.name}{!m.is_active && <span className="ml-2"><Badge>nonaktif</Badge></span>}</td>
                    <td className={`td num text-right font-bold ${m.low_stock ? 'text-st-danger' : ''}`}>{num(m.stock)} <span className="font-normal text-ink-soft">{m.unit}</span>{m.low_stock && <span className="ml-2"><Badge tone="danger">menipis</Badge></span>}</td>
                    <td className="td num text-right text-ink-soft">{num(m.min_stock)}</td>
                    <td className="td num text-right">{rupiah(m.price)}</td>
                    <td className="td whitespace-nowrap text-right">
                      <Button size="sm" variant="ghost" onClick={() => setCardFor(m)}>Kartu stok</Button>
                      {can('medicine.manage') && <><Button size="sm" variant="ghost" icon={PackagePlus} onClick={() => setStockFor(m)}>Mutasi</Button>
                        <Button size="sm" variant="ghost" icon={Pencil} onClick={() => setEditing(m)} aria-label={`Ubah ${m.name}`} /></>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pagination meta={list.meta} onPage={setPage} />
      </div>
      {stockFor && <StockModal medicine={stockFor} onClose={() => setStockFor(null)} onDone={() => { setStockFor(null); list.reload(); toast('Stok diperbarui'); }} />}
      {cardFor && <StockCard medicine={cardFor} onClose={() => setCardFor(null)} />}
      {editing && <MedicineForm medicine={editing} onClose={() => setEditing(null)} onDone={() => { setEditing(null); list.reload(); toast('Data obat disimpan'); }} />}
    </>
  );
}

function StockModal({ medicine, onClose, onDone }) {
  const [form, setForm] = useState({ type: 'in', quantity: '', note: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const errors = error?.fieldErrors?.() || {};
  const go = async () => {
    setBusy(true); setError(null);
    try { await yii.post(`/medicines/${medicine.id}/stock`, { ...form, quantity: Number(form.quantity) }); onDone(); }
    catch (e) { setError(e); setBusy(false); }
  };
  return (
    <Modal open title={`Mutasi stok ${medicine.name}`} onClose={onClose}
      footer={<><Button variant="secondary" onClick={onClose}>Batal</Button><Button busy={busy} icon={SlidersHorizontal} onClick={go}>Simpan mutasi</Button></>}>
      <p className="num mb-3 text-[0.92rem] text-ink-soft">Stok sekarang {num(medicine.stock)} {medicine.unit}</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <Select label="Jenis" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} error={errors.type}>
          <option value="in">Penerimaan barang</option><option value="adjustment">Penyesuaian (stok opname)</option>
        </Select>
        <Input label={form.type === 'in' ? 'Jumlah masuk' : 'Selisih (negatif untuk mengurangi)'} type="number" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} error={errors.quantity} />
        <Textarea label={form.type === 'adjustment' ? 'Alasan penyesuaian' : 'Catatan (opsional)'} rows={2} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} error={errors.note} className="sm:col-span-2" />
      </div>
      {error && !Object.keys(errors).length && <div className="mt-3"><ErrorBox error={error} /></div>}
    </Modal>
  );
}

const MOVE = { in: 'Masuk', dispense: 'Resep', adjustment: 'Penyesuaian', return: 'Retur' };
function StockCard({ medicine, onClose }) {
  const [page, setPage] = useState(1);
  const r = useApi(() => yii.get(`/medicines/${medicine.id}/movements`, { page, limit: 15 }), [medicine.id, page]);
  return (
    <Modal open title={`Kartu stok ${medicine.name}`} onClose={onClose} width="max-w-2xl">
      {r.loading && !r.data ? <Spinner /> : !r.data?.length ? <Empty title="Belum ada mutasi" /> : (
        <table className="w-full text-[0.92rem]">
          <thead className="border-b border-line"><tr><th className="th">Waktu</th><th className="th">Jenis</th><th className="th">Keterangan</th><th className="th text-right">Mutasi</th><th className="th text-right">Saldo</th></tr></thead>
          <tbody className="divide-y divide-line">
            {r.data.map((m) => (
              <tr key={m.id}><td className="td num">{waktu(m.created_at)}</td><td className="td">{MOVE[m.movement_type]}</td><td className="td text-ink-soft">{m.note || '-'}</td>
                <td className={`td num text-right font-semibold ${m.quantity < 0 ? 'text-st-danger' : 'text-st-done'}`}>{m.quantity > 0 ? '+' : ''}{num(m.quantity)}</td>
                <td className="td num text-right">{num(m.stock_after)}</td></tr>
            ))}
          </tbody>
        </table>
      )}
      <Pagination meta={r.meta} onPage={setPage} />
    </Modal>
  );
}

function MedicineForm({ medicine, onClose, onDone }) {
  const isNew = !medicine.id;
  const [form, setForm] = useState({ code: medicine.code || '', name: medicine.name || '', unit: medicine.unit || '', price: medicine.price ?? '', min_stock: medicine.min_stock ?? 0, stock: 0, is_active: medicine.is_active ?? true });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const errors = error?.fieldErrors?.() || {};
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });
  const go = async () => {
    setBusy(true); setError(null);
    const body = { ...form, price: Number(form.price), min_stock: Number(form.min_stock), stock: Number(form.stock) };
    try { isNew ? await yii.post('/medicines', body) : await yii.put(`/medicines/${medicine.id}`, body); onDone(); }
    catch (e) { setError(e); setBusy(false); }
  };
  return (
    <Modal open title={isNew ? 'Obat baru' : `Ubah ${medicine.name}`} onClose={onClose}
      footer={<><Button variant="secondary" onClick={onClose}>Batal</Button><Button busy={busy} onClick={go}>Simpan</Button></>}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Input label="Kode" value={form.code} onChange={set('code')} error={errors.code} />
        <Input label="Satuan" placeholder="tablet, botol, kapsul" value={form.unit} onChange={set('unit')} error={errors.unit} />
        <Input label="Nama obat" value={form.name} onChange={set('name')} error={errors.name} className="sm:col-span-2" />
        <Input label="Harga per satuan" type="number" min={0} value={form.price} onChange={set('price')} error={errors.price} />
        <Input label="Stok minimum" type="number" min={0} value={form.min_stock} onChange={set('min_stock')} error={errors.min_stock} />
        {isNew ? <Input label="Stok awal" type="number" min={0} value={form.stock} onChange={set('stock')} hint="Dicatat sebagai mutasi masuk" />
          : <label className="flex items-center gap-2 pt-6 text-[0.92rem]"><input type="checkbox" checked={form.is_active} onChange={set('is_active')} className="accent-rs" /> Aktif</label>}
      </div>
      {error && !Object.keys(errors).length && <div className="mt-3"><ErrorBox error={error} /></div>}
    </Modal>
  );
}

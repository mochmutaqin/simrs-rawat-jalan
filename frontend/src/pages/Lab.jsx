import { useEffect, useRef, useState } from 'react';
import { RefreshCw, Save } from 'lucide-react';
import { newIdempotencyKey, node } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { PageHeader } from '../components/Layout';
import { Button, Empty, ErrorBox, Pagination, Spinner, StatusBadge, Tabs, useToast } from '../components/ui';
import { LAB_STATUS, waktu } from '../lib/format';
import { useApi } from '../lib/useApi';

/**
 * Worklist laboratorium. Data dibaca dari services-node; input hasil dikirim ke Node,
 * yang meneruskan ke Yii (satu pintu tulis) dengan Idempotency-Key yang sama setiap retry.
 */
export default function Lab() {
  const [status, setStatus] = useState('requested');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState(null);
  const list = useApi(() => node.get('/lab/requests', { status, page, limit: 20 }), [status, page]);
  useEffect(() => { const t = setInterval(list.reload, 20000); return () => clearInterval(t); }, [list.reload]);

  return (
    <>
      <PageHeader unit="lab" title="Permintaan laboratorium" subtitle="Pilih permintaan, kerjakan pemeriksaan, lalu input hasilnya. Dokter langsung melihat hasil di rekam medis."
        actions={<Button variant="secondary" icon={RefreshCw} onClick={list.reload}>Muat ulang</Button>} />
      <Tabs value={status} onChange={(s) => { setStatus(s); setPage(1); setSelected(null); }}
        tabs={[{ value: 'requested', label: 'Baru' }, { value: 'in_progress', label: 'Dikerjakan' }, { value: 'completed', label: 'Selesai' }]} />
      <div className="mt-4 grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        <section className="panel self-start">
          <ErrorBox error={list.error} onRetry={list.reload} />
          {list.loading && !list.data ? <div className="px-4"><Spinner /></div> : !list.data?.length ? <Empty title="Tidak ada permintaan" /> : (
            <ul className="divide-y divide-line">
              {list.data.map((r) => (
                <li key={r.id}>
                  <button onClick={() => setSelected(r.id)} className={`flex w-full items-center gap-3 px-4 py-3 text-left ${selected === r.id ? 'bg-unit-lab/5' : 'hover:bg-wall'}`}>
                    <span className={`h-10 w-1 rounded-full ${selected === r.id ? 'bg-unit-lab' : 'bg-transparent'}`} aria-hidden />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold">{r.patient_name}</p>
                      <p className="num text-[0.85rem] text-ink-soft">{r.medical_record_no} · {r.poli} · {r.requested_by}</p>
                    </div>
                    <div className="text-right text-[0.85rem]">
                      <p className="num font-semibold">{r.resulted_count}/{r.item_count} hasil</p>
                      <p className="num text-ink-soft">{waktu(r.created_at)}</p>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <Pagination meta={list.meta} onPage={setPage} />
        </section>
        <section>{selected ? <RequestDetail id={selected} onSaved={list.reload} /> : <div className="panel"><Empty title="Pilih permintaan">Detail pemeriksaan dan form hasil akan tampil di sini.</Empty></div>}</section>
      </div>
    </>
  );
}

function RequestDetail({ id, onSaved }) {
  const r = useApi(() => node.get(`/lab/requests/${id}`), [id]);
  if (r.loading && !r.data) return <div className="panel px-4"><Spinner /></div>;
  if (r.error) return <ErrorBox error={r.error} onRetry={r.reload} />;
  const d = r.data;
  return (
    <div className="panel">
      <header className="flex items-start justify-between gap-3 border-b border-line px-5 py-3">
        <div><p className="text-lg font-bold">{d.patient_name}</p><p className="num text-[0.88rem] text-ink-soft">{d.medical_record_no} · permintaan #{d.id} · {d.requested_by} · {waktu(d.created_at)}</p></div>
        <StatusBadge map={LAB_STATUS} value={d.status} />
      </header>
      <ul className="divide-y divide-line">
        {d.items.map((it) => <ResultRow key={it.id} item={it} disabled={d.status === 'cancelled'} onSaved={() => { r.reload(); onSaved(); }} />)}
      </ul>
    </div>
  );
}

function ResultRow({ item, disabled, onSaved }) {
  const toast = useToast();
  const { can } = useAuth();
  const [form, setForm] = useState({ result_value: item.result_value || '', result_unit: item.result_unit || item.default_unit || '', result_flag: item.result_flag || 'normal', result_notes: item.result_notes || '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  // satu kunci per isian: retry (mis. setelah 503) memakai kunci yang sama, isian baru = kunci baru
  const keyRef = useRef(newIdempotencyKey('lab'));
  const set = (k) => (e) => { keyRef.current = newIdempotencyKey('lab'); setForm({ ...form, [k]: e.target.value }); };

  const save = async () => {
    setBusy(true); setError(null);
    const body = { result_value: form.result_value, result_flag: form.result_flag, ...(form.result_unit ? { result_unit: form.result_unit } : {}), ...(form.result_notes ? { result_notes: form.result_notes } : {}) };
    try {
      const { data } = await node.post(`/lab/items/${item.id}/result`, body, { headers: { 'Idempotency-Key': keyRef.current } });
      toast(data?.request_status === 'completed' ? 'Semua hasil lengkap. Permintaan pindah ke tab Selesai.' : `Hasil ${item.name} disimpan`);
      onSaved();
    }
    catch (e) { setError(e); } finally { setBusy(false); }
  };

  return (
    <li className="px-5 py-4">
      <div className="flex items-baseline justify-between gap-2">
        <p className="font-semibold">{item.name}</p>
        <p className="num text-[0.85rem] text-ink-soft">rujukan {item.ref_range || item.default_ref_range || '-'}{item.resulted_at && ` · diisi ${waktu(item.resulted_at)}`}</p>
      </div>
      <fieldset disabled={disabled || !can('lab.result')} className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-[1fr_7rem_9rem_auto]">
        <input className="field-input num" placeholder="Hasil" aria-label={`Hasil ${item.name}`} value={form.result_value} onChange={set('result_value')} />
        <input className="field-input" placeholder="Satuan" aria-label="Satuan" value={form.result_unit} onChange={set('result_unit')} />
        <select className="field-input" aria-label="Interpretasi" value={form.result_flag} onChange={set('result_flag')}>
          <option value="normal">Normal</option><option value="high">Tinggi</option><option value="low">Rendah</option><option value="abnormal">Abnormal</option>
        </select>
        <Button size="sm" icon={Save} busy={busy} disabled={!form.result_value.trim()} onClick={save}>{item.result_value ? 'Perbarui' : 'Simpan'}</Button>
        <input className="field-input col-span-full" placeholder="Catatan (opsional)" aria-label="Catatan" value={form.result_notes} onChange={set('result_notes')} />
      </fieldset>
      {error && (
        <div className="mt-2"><ErrorBox error={error.code === 'UPSTREAM_UNAVAILABLE' ? { ...error, message: `${error.message} Tekan Simpan lagi: data tidak akan tercatat ganda.` } : error} /></div>
      )}
    </li>
  );
}

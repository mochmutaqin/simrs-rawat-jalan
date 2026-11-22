import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, FlaskConical, History, Pill, Plus, Save, Stethoscope, Trash2, X } from 'lucide-react';
import { yii } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { Badge, Button, Empty, ErrorBox, Input, Modal, QueueTicket, Select, Spinner, StatusBadge, Textarea, useToast } from '../components/ui';
import { ICD10_COMMON } from '../lib/icd10';
import { LAB_STATUS, rupiah, RX_STATUS, umur, VISIT_STATUS, waktu } from '../lib/format';
import { useApi } from '../lib/useApi';
import { MedicalRecords } from './Patients';

const VITALS = [
  ['bp_systolic', 'Sistolik', 'mmHg'], ['bp_diastolic', 'Diastolik', 'mmHg'], ['heart_rate', 'Nadi', 'x/menit'],
  ['resp_rate', 'Napas', 'x/menit'], ['temperature', 'Suhu', '°C'], ['spo2', 'SpO₂', '%'], ['weight_kg', 'Berat', 'kg'], ['height_cm', 'Tinggi', 'cm'],
];
const TEXT_FIELDS = ['chief_complaint', 'anamnesis', 'physical_exam'];

export default function Examination() {
  const { visitId } = useParams();
  const visit = useApi(() => yii.get(`/visits/${visitId}`), [visitId]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [recordsOpen, setRecordsOpen] = useState(false);

  if (visit.loading && !visit.data) return <Spinner />;
  if (visit.error) return <ErrorBox error={visit.error} />;
  const v = visit.data;
  const locked = ['cancelled'].includes(v.status);

  return (
    <>
      <Link to="/pemeriksaan" className="mb-4 inline-flex items-center gap-1.5 text-[0.9rem] text-ink-soft hover:text-ink"><ArrowLeft className="h-4 w-4" /> Antrean dokter</Link>
      <header className="mb-6 flex flex-wrap items-center gap-5 border-l-[6px] border-unit-exam pl-4">
        <QueueTicket code={v.queue_code} size="lg" tone="exam" />
        <div className="min-w-0 flex-1">
          <h1 className="text-[1.65rem] font-extrabold leading-tight">{v.patient.name}</h1>
          <p className="num text-ink-soft">{v.patient.medical_record_no} · {v.patient.gender === 'L' ? 'Laki-laki' : 'Perempuan'}, {umur(v.patient.birth_date)} · {v.poli_name} · {v.doctor_name}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge map={VISIT_STATUS} value={v.status} />
          <Button variant="secondary" size="sm" icon={History} onClick={() => setRecordsOpen(true)}>Riwayat berobat</Button>
          <Button variant="secondary" size="sm" icon={History} onClick={() => setHistoryOpen(true)}>Jejak perubahan</Button>
        </div>
      </header>

      {locked ? <ErrorBox error={{ message: 'Kunjungan ini sudah dibatalkan.' }} /> : (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
          <ExamForm visit={v} onSaved={visit.reload} />
          <div className="space-y-6">
            <ProceduresPanel visitId={v.id} />
            <PrescriptionPanel visitId={v.id} />
            <LabPanel visitId={v.id} />
          </div>
        </div>
      )}

      <Modal open={recordsOpen} title={`Riwayat berobat ${v.patient.name}`} onClose={() => setRecordsOpen(false)} width="max-w-4xl">
        {recordsOpen && <MedicalRecords patientId={v.patient.id} excludeVisitId={v.id} />}
      </Modal>
      <Modal open={historyOpen} title="Jejak perubahan pemeriksaan" onClose={() => setHistoryOpen(false)} width="max-w-3xl">
        {historyOpen && <AuditHistory visitId={v.id} />}
      </Modal>
    </>
  );
}

/* ---------------- pemeriksaan & diagnosis ---------------- */
function ExamForm({ visit, onSaved }) {
  const toast = useToast();
  const { can } = useAuth();
  const exam = visit.examination;
  const isFinal = exam?.status === 'final';
  const init = () => {
    const f = {};
    [...TEXT_FIELDS, ...VITALS.map((x) => x[0])].forEach((k) => { f[k] = exam?.[k] ?? ''; });
    return f;
  };
  const [form, setForm] = useState(init);
  const [diagnoses, setDiagnoses] = useState(() => exam?.diagnoses?.map(({ icd10_code, diagnosis_name, diagnosis_type }) => ({ icd10_code, diagnosis_name, diagnosis_type })) || []);
  const [reason, setReason] = useState('');
  const [errors, setErrors] = useState({});
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(null);
  useEffect(() => { setForm(init()); /* eslint-disable-next-line */ }, [exam?.version]);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const payload = () => {
    const body = {};
    TEXT_FIELDS.forEach((k) => { body[k] = form[k] || null; });
    VITALS.forEach(([k]) => { body[k] = form[k] === '' || form[k] === null ? null : Number(form[k]); });
    body.diagnoses = diagnoses.filter((d) => d.icd10_code || d.diagnosis_name);
    if (isFinal) body.reason = reason;
    return body;
  };

  const save = async () => {
    setBusy('save'); setError(null); setErrors({});
    try { await yii.put(`/visits/${visit.id}/examination`, payload()); setReason(''); toast('Pemeriksaan disimpan'); onSaved(); }
    catch (e) { setErrors(e.fieldErrors()); setError(e); }
    finally { setBusy(null); }
  };
  const finalize = async () => {
    setBusy('final'); setError(null);
    try {
      await yii.put(`/visits/${visit.id}/examination`, payload());
      await yii.post(`/visits/${visit.id}/examination/finalize`);
      toast('Pemeriksaan selesai. Pasien diarahkan ke farmasi/kasir.'); onSaved();
    } catch (e) { setErrors(e.fieldErrors()); setError(e); }
    finally { setBusy(null); }
  };

  const setDiag = (i, patch) => setDiagnoses(diagnoses.map((d, j) => (j === i ? { ...d, ...patch } : d)));
  const addDiag = () => setDiagnoses([...diagnoses, { icd10_code: '', diagnosis_name: '', diagnosis_type: diagnoses.some((d) => d.diagnosis_type === 'primary') ? 'secondary' : 'primary' }]);
  const canEdit = can('exam.manage');

  return (
    <section className="panel">
      <div className="flex items-center justify-between border-b border-line px-5 py-3">
        <h2 className="flex items-center gap-2 font-bold"><Stethoscope className="h-4 w-4 text-unit-exam" />Pemeriksaan</h2>
        {exam && <span className="text-[0.85rem] text-ink-soft">{isFinal ? <Badge tone="done">Final</Badge> : <Badge tone="wait">Draf</Badge>} <span className="num ml-1">versi {exam.version}</span></span>}
      </div>
      <fieldset disabled={!canEdit} className="space-y-5 px-5 py-4">
        <Input label="Keluhan utama" value={form.chief_complaint} onChange={set('chief_complaint')} error={errors.chief_complaint} />
        <Textarea label="Anamnesis" rows={3} value={form.anamnesis} onChange={set('anamnesis')} error={errors.anamnesis} />
        <div>
          <p className="mb-2 text-[0.85rem] font-semibold text-ink-soft">Tanda-tanda vital</p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {VITALS.map(([k, label, unit]) => (
              <Input key={k} label={`${label} (${unit})`} type="number" step="any" inputMode="decimal" value={form[k]} onChange={set(k)} error={errors[k]} />
            ))}
          </div>
        </div>
        <Textarea label="Pemeriksaan fisik" rows={3} value={form.physical_exam} onChange={set('physical_exam')} error={errors.physical_exam} />

        <div>
          <div className="mb-2 flex items-center justify-between">
            <p className="text-[0.85rem] font-semibold text-ink-soft">Diagnosis (ICD-10)</p>
            <Button size="sm" variant="ghost" icon={Plus} onClick={addDiag}>Tambah diagnosis</Button>
          </div>
          <datalist id="icd10-list">{ICD10_COMMON.map(([c, n]) => <option key={c} value={c}>{n}</option>)}</datalist>
          {diagnoses.length === 0 && <p className="rounded-md bg-wall px-3 py-2.5 text-[0.9rem] text-ink-soft">Belum ada diagnosis. Diagnosis utama wajib diisi sebelum pemeriksaan diselesaikan.</p>}
          <ul className="space-y-2">
            {diagnoses.map((d, i) => (
              <li key={i} className="grid grid-cols-[7rem_1fr_9rem_auto] items-start gap-2">
                <input className="field-input num uppercase" list="icd10-list" placeholder="Kode" aria-label="Kode ICD-10" value={d.icd10_code}
                  onChange={(e) => {
                    const code = e.target.value.toUpperCase();
                    const known = ICD10_COMMON.find(([c]) => c === code);
                    setDiag(i, { icd10_code: code, ...(known && !d.diagnosis_name ? { diagnosis_name: known[1] } : {}) });
                  }} />
                <input className="field-input" placeholder="Nama diagnosis" aria-label="Nama diagnosis" value={d.diagnosis_name} onChange={(e) => setDiag(i, { diagnosis_name: e.target.value })} />
                <select className="field-input" aria-label="Jenis diagnosis" value={d.diagnosis_type} onChange={(e) => setDiag(i, { diagnosis_type: e.target.value })}>
                  <option value="primary">Utama</option><option value="secondary">Sekunder</option>
                </select>
                <button type="button" className="rounded p-2 text-ink-soft hover:bg-wall hover:text-st-danger" aria-label="Hapus diagnosis" onClick={() => setDiagnoses(diagnoses.filter((_, j) => j !== i))}><X className="h-4 w-4" /></button>
              </li>
            ))}
          </ul>
        </div>

        {isFinal && canEdit && (
          <div className="rounded-md border border-st-wait/40 bg-st-wait/5 p-3">
            <Textarea label="Alasan perubahan (wajib, pemeriksaan sudah final)" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} error={errors.reason}
              hint="Perubahan dicatat di jejak perubahan beserta alasan ini." />
          </div>
        )}
        <ErrorBox error={error} />
      </fieldset>
      {canEdit && (
        <div className="flex flex-wrap justify-end gap-2 border-t border-line bg-wall/50 px-5 py-3">
          <Button variant="secondary" icon={Save} busy={busy === 'save'} onClick={save}>{isFinal ? 'Simpan koreksi' : 'Simpan draf'}</Button>
          {!isFinal && <Button icon={CheckCircle2} busy={busy === 'final'} onClick={finalize}>Selesaikan pemeriksaan</Button>}
        </div>
      )}
    </section>
  );
}

/* ---------------- tindakan ---------------- */
function ProceduresPanel({ visitId }) {
  const toast = useToast();
  const { can } = useAuth();
  const list = useApi(() => yii.get(`/visits/${visitId}/procedures`, { include_voided: 1 }), [visitId]);
  const master = useApi(() => yii.get('/procedures', { is_active: true, limit: 100 }), []);
  const [form, setForm] = useState({ procedure_id: '', quantity: 1 });
  const [voiding, setVoiding] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const selected = master.data?.find((p) => String(p.id) === String(form.procedure_id));

  const add = async () => {
    setBusy(true); setError(null);
    try { await yii.post(`/visits/${visitId}/procedures`, { procedure_id: Number(form.procedure_id), quantity: Number(form.quantity) }); setForm({ procedure_id: '', quantity: 1 }); list.reload(); toast('Tindakan ditambahkan ke tagihan'); }
    catch (e) { setError(e); } finally { setBusy(false); }
  };

  return (
    <section className="panel">
      <h2 className="flex items-center justify-between border-b border-line px-5 py-3 font-bold">Tindakan medis<span className="num text-[0.9rem] font-semibold text-ink-soft">{rupiah(list.meta?.total)}</span></h2>
      <div className="px-5 py-4">
        {list.data?.length ? (
          <ul className="mb-4 divide-y divide-line">
            {list.data.map((p) => (
              <li key={p.id} className={`flex items-center gap-3 py-2 ${p.voided_at ? 'text-ink-faint line-through' : ''}`}>
                <span className="flex-1">{p.name}{p.quantity > 1 && ` ×${p.quantity}`}{p.voided_at && <span className="block text-[0.82rem] no-underline">dibatalkan: {p.void_reason}</span>}</span>
                <span className="num">{rupiah(p.subtotal)}</span>
                {!p.voided_at && can('procedure.manage') && <button className="rounded p-1.5 text-ink-soft hover:bg-wall hover:text-st-danger" aria-label={`Batalkan ${p.name}`} onClick={() => setVoiding(p)}><Trash2 className="h-4 w-4" /></button>}
              </li>
            ))}
          </ul>
        ) : <p className="mb-4 text-[0.9rem] text-ink-soft">Belum ada tindakan.</p>}
        {can('procedure.manage') && (
          <div className="grid grid-cols-[1fr_5rem_auto] items-end gap-2">
            <Select label="Tindakan" value={form.procedure_id} onChange={(e) => setForm({ ...form, procedure_id: e.target.value })}>
              <option value="">Pilih tindakan</option>
              {master.data?.map((p) => <option key={p.id} value={p.id}>{p.name} · {rupiah(p.price)}</option>)}
            </Select>
            <Input label="Jumlah" type="number" min={1} value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} />
            <Button icon={Plus} busy={busy} disabled={!form.procedure_id} onClick={add}>Tambah</Button>
          </div>
        )}
        {selected && <p className="num mt-2 text-[0.85rem] text-ink-soft">Tarif {rupiah(selected.price)} × {form.quantity} = {rupiah(selected.price * form.quantity)}</p>}
        {error && <div className="mt-3"><ErrorBox error={error} /></div>}
      </div>
      {voiding && <ReasonModal title={`Batalkan tindakan ${voiding.name}`} confirm="Batalkan tindakan" note="Baris tagihan ikut dibatalkan. Bila sudah dibayar, kasir akan melihat kelebihan bayar untuk di-refund."
        onClose={() => setVoiding(null)} onSubmit={async (reason) => { await yii.del(`/visits/${visitId}/procedures/${voiding.id}`, { reason }); setVoiding(null); list.reload(); toast('Tindakan dibatalkan'); }} />}
    </section>
  );
}

/* ---------------- resep ---------------- */
const EMPTY_RX = { medicine_id: '', dose: '', frequency: '', quantity: '', instructions: '' };
function PrescriptionPanel({ visitId }) {
  const toast = useToast();
  const { can } = useAuth();
  const list = useApi(() => yii.get(`/visits/${visitId}/prescriptions`), [visitId]);
  const meds = useApi(() => yii.get('/medicines', { is_active: true, limit: 100 }), []);
  const [items, setItems] = useState([{ ...EMPTY_RX }]);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const medMap = useMemo(() => Object.fromEntries((meds.data || []).map((m) => [String(m.id), m])), [meds.data]);
  const setItem = (i, patch) => setItems(items.map((x, j) => (j === i ? { ...x, ...patch } : x)));

  const submit = async () => {
    setBusy(true); setError(null);
    try {
      await yii.post(`/visits/${visitId}/prescriptions`, { items: items.map((x) => ({ ...x, medicine_id: Number(x.medicine_id), quantity: Number(x.quantity) })) });
      setItems([{ ...EMPTY_RX }]); list.reload(); meds.reload(); toast('Resep dikirim ke farmasi');
    } catch (e) { setError(e); } finally { setBusy(false); }
  };

  return (
    <section className="panel">
      <h2 className="flex items-center gap-2 border-b border-line px-5 py-3 font-bold"><Pill className="h-4 w-4 text-unit-pharm" />Resep obat</h2>
      <div className="space-y-4 px-5 py-4">
        {list.data?.map((rx) => (
          <div key={rx.id} className="rounded-md border border-line">
            <div className="flex items-center justify-between border-b border-line bg-wall/50 px-3 py-2 text-[0.88rem]">
              <span className="font-semibold">Resep #{rx.id}</span><StatusBadge map={RX_STATUS} value={rx.status} />
            </div>
            <ul className="divide-y divide-line text-[0.9rem]">
              {rx.items.map((it) => <li key={it.id} className="flex justify-between gap-2 px-3 py-1.5"><span>{it.medicine_name} · {it.dose}, {it.frequency}</span><span className="num text-ink-soft">{it.quantity} {it.unit}</span></li>)}
            </ul>
          </div>
        ))}
        {can('prescription.manage') && (
          <div>
            <p className="mb-2 text-[0.85rem] font-semibold text-ink-soft">Resep baru</p>
            <div className="space-y-3">
              {items.map((it, i) => {
                const m = medMap[String(it.medicine_id)];
                return (
                  <div key={i} className="grid grid-cols-2 gap-2 rounded-md bg-wall/60 p-2.5 sm:grid-cols-[1.6fr_1fr_1fr_5rem_auto]">
                    <select className="field-input col-span-2 sm:col-span-1" aria-label="Obat" value={it.medicine_id} onChange={(e) => setItem(i, { medicine_id: e.target.value })}>
                      <option value="">Pilih obat</option>
                      {meds.data?.map((x) => <option key={x.id} value={x.id} disabled={x.stock <= 0}>{x.name} (stok {x.stock})</option>)}
                    </select>
                    <input className="field-input" placeholder="Dosis" aria-label="Dosis" value={it.dose} onChange={(e) => setItem(i, { dose: e.target.value })} />
                    <input className="field-input" placeholder="Frekuensi" aria-label="Frekuensi" value={it.frequency} onChange={(e) => setItem(i, { frequency: e.target.value })} />
                    <input className="field-input num" type="number" min={1} placeholder="Jml" aria-label="Jumlah" value={it.quantity} onChange={(e) => setItem(i, { quantity: e.target.value })} />
                    <button type="button" className="rounded p-2 text-ink-soft hover:text-st-danger disabled:opacity-30" aria-label="Hapus baris" disabled={items.length === 1} onClick={() => setItems(items.filter((_, j) => j !== i))}><X className="h-4 w-4" /></button>
                    {m && <p className="num col-span-full text-[0.8rem] text-ink-soft">{rupiah(m.price)} / {m.unit} · stok {m.stock}{it.quantity ? ` · subtotal ${rupiah(m.price * it.quantity)}` : ''}</p>}
                  </div>
                );
              })}
            </div>
            <div className="mt-3 flex justify-between">
              <Button size="sm" variant="ghost" icon={Plus} onClick={() => setItems([...items, { ...EMPTY_RX }])}>Tambah obat</Button>
              <Button size="sm" busy={busy} disabled={!items.every((x) => x.medicine_id && x.dose && x.frequency && x.quantity)} onClick={submit}>Kirim resep ke farmasi</Button>
            </div>
            {error && <div className="mt-3"><ErrorBox error={error} /></div>}
          </div>
        )}
      </div>
    </section>
  );
}

/* ---------------- laboratorium ---------------- */
function LabPanel({ visitId }) {
  const toast = useToast();
  const { can } = useAuth();
  const list = useApi(() => yii.get(`/visits/${visitId}/lab-requests`), [visitId]);
  const tests = useApi(() => yii.get('/lab-tests', { is_active: true, limit: 100 }), []);
  const [picked, setPicked] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const toggle = (id) => setPicked(picked.includes(id) ? picked.filter((x) => x !== id) : [...picked, id]);

  const submit = async () => {
    setBusy(true); setError(null);
    try { await yii.post(`/visits/${visitId}/lab-requests`, { test_ids: picked }); setPicked([]); list.reload(); toast('Permintaan dikirim ke laboratorium'); }
    catch (e) { setError(e); } finally { setBusy(false); }
  };

  return (
    <section className="panel">
      <h2 className="flex items-center gap-2 border-b border-line px-5 py-3 font-bold"><FlaskConical className="h-4 w-4 text-unit-lab" />Pemeriksaan laboratorium</h2>
      <div className="space-y-4 px-5 py-4">
        {list.data?.map((r) => (
          <div key={r.id} className="rounded-md border border-line">
            <div className="flex items-center justify-between border-b border-line bg-wall/50 px-3 py-2 text-[0.88rem]">
              <span className="font-semibold">Permintaan #{r.id}</span><StatusBadge map={LAB_STATUS} value={r.status} />
            </div>
            <table className="w-full text-[0.9rem]"><tbody className="divide-y divide-line">
              {r.items.map((it) => (
                <tr key={it.id}>
                  <td className="px-3 py-1.5">{it.name}</td>
                  <td className="num px-3 py-1.5 text-right">{it.result_value ? <><b className={it.result_flag && it.result_flag !== 'normal' ? 'text-st-danger' : ''}>{it.result_value}</b> {it.result_unit}</> : <span className="text-ink-faint">menunggu</span>}</td>
                  <td className="num px-3 py-1.5 text-right text-[0.82rem] text-ink-soft">{it.ref_range && `rujukan ${it.ref_range}`}</td>
                </tr>
              ))}
            </tbody></table>
          </div>
        ))}
        {can('lab.request') && (
          <div>
            <p className="mb-2 text-[0.85rem] font-semibold text-ink-soft">Permintaan baru</p>
            <div className="grid gap-1.5 sm:grid-cols-2">
              {tests.data?.map((t) => (
                <label key={t.id} className={`flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-[0.9rem] ${picked.includes(t.id) ? 'border-unit-lab bg-unit-lab/5' : 'border-line'}`}>
                  <input type="checkbox" checked={picked.includes(t.id)} onChange={() => toggle(t.id)} className="accent-unit-lab" />
                  <span className="flex-1">{t.name}</span><span className="num text-ink-soft">{rupiah(t.price)}</span>
                </label>
              ))}
            </div>
            <div className="mt-3 flex justify-end"><Button size="sm" busy={busy} disabled={!picked.length} onClick={submit}>Kirim permintaan lab</Button></div>
            {error && <div className="mt-3"><ErrorBox error={error} /></div>}
          </div>
        )}
      </div>
    </section>
  );
}

/* ---------------- jejak audit ---------------- */
const FIELD_LABEL = { chief_complaint: 'Keluhan', anamnesis: 'Anamnesis', physical_exam: 'Pemeriksaan fisik', bp_systolic: 'Sistolik', bp_diastolic: 'Diastolik',
  heart_rate: 'Nadi', resp_rate: 'Napas', temperature: 'Suhu', spo2: 'SpO₂', weight_kg: 'Berat', height_cm: 'Tinggi', status: 'Status' };
function AuditHistory({ visitId }) {
  const r = useApi(() => yii.get(`/visits/${visitId}/examination/history`), [visitId]);
  if (r.loading) return <Spinner />;
  if (!r.data?.length) return <Empty title="Belum ada perubahan tercatat" />;
  return (
    <ol className="space-y-3">
      {r.data.map((a) => {
        let what;
        if (a.table_name === 'examination_diagnoses') {
          const d = a.new_data;
          what = a.action === 'INSERT' ? `Diagnosis ditambahkan: ${d.icd10_code} ${d.diagnosis_name} (${d.diagnosis_type === 'primary' ? 'utama' : 'sekunder'})`
            : d?.voided_at ? `Diagnosis dihapus: ${d.icd10_code} ${d.diagnosis_name}` : 'Diagnosis diubah';
        } else if (a.action === 'INSERT') {
          what = 'Pemeriksaan dibuat';
        } else {
          const changed = Object.keys(FIELD_LABEL).filter((k) => JSON.stringify(a.old_data?.[k]) !== JSON.stringify(a.new_data?.[k]));
          what = changed.length ? `Diubah: ${changed.map((k) => `${FIELD_LABEL[k]} ${a.old_data?.[k] ?? '-'} → ${a.new_data?.[k] ?? '-'}`).join('; ')}` : 'Disimpan ulang';
        }
        return (
          <li key={a.id} className="border-l-2 border-line pl-3 text-[0.9rem]">
            <p className="text-[0.82rem] text-ink-soft"><span className="num">{waktu(a.changed_at)}</span> · {a.changed_by || 'sistem'}</p>
            <p>{what}</p>
            {a.reason && <p className="text-[0.85rem] text-st-wait">Alasan: {a.reason}</p>}
          </li>
        );
      })}
    </ol>
  );
}

/* ---------------- modal alasan (dipakai beberapa aksi) ---------------- */
export function ReasonModal({ title, note, confirm, onClose, onSubmit }) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const go = async () => { setBusy(true); setError(null); try { await onSubmit(reason); } catch (e) { setError(e); setBusy(false); } };
  return (
    <Modal open title={title} onClose={onClose} footer={<><Button variant="secondary" onClick={onClose}>Kembali</Button><Button variant="danger" busy={busy} onClick={go}>{confirm}</Button></>}>
      {note && <p className="mb-3 text-[0.92rem] text-ink-soft">{note}</p>}
      <Textarea label="Alasan" value={reason} onChange={(e) => setReason(e.target.value)} />
      {error && <div className="mt-3"><ErrorBox error={error} /></div>}
    </Modal>
  );
}

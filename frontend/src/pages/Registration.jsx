/**
 * SIMRS Rawat Jalan
 *
 * @author  Mochamad Mutaqin Kurniawan <mochmutaqin@gmail.com>
 * @link    https://github.com/mochmutaqin/simrs-rawat-jalan
 */

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, RefreshCw, UserPlus, XCircle } from 'lucide-react';
import { yii } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { PageHeader } from '../components/Layout';
import PatientForm from '../components/PatientForm';
import PatientSearch from '../components/PatientSearch';
import { Button, Empty, ErrorBox, Input, Modal, Pagination, QueueTicket, Select, Spinner, StatusBadge, Tabs, Textarea, useToast } from '../components/ui';
import { jam, today, umur, VISIT_STATUS } from '../lib/format';
import { useApi } from '../lib/useApi';

const STATUS_TABS = [
  { value: '', label: 'Semua' }, { value: 'waiting', label: 'Menunggu' }, { value: 'in_exam', label: 'Diperiksa' },
  { value: 'exam_done', label: 'Selesai diperiksa' }, { value: 'completed', label: 'Selesai' }, { value: 'cancelled', label: 'Batal' },
];
const ticketTone = (s) => ({ waiting: 'wait', in_exam: 'exam', exam_done: 'done', completed: 'done', cancelled: 'cancel' }[s]);

export default function Registration() {
  const { can } = useAuth();
  const toast = useToast();
  const [filter, setFilter] = useState({ date: today(), poli_id: '', status: '', q: '', page: 1 });
  const [registerOpen, setRegisterOpen] = useState(false);
  const [cancelVisit, setCancelVisit] = useState(null);
  const polis = useApi(() => yii.get('/polis', { is_active: true, limit: 100 }), []);
  const visits = useApi(() => yii.get('/visits', { ...filter, limit: 25 }), [JSON.stringify(filter)]);

  // antrean diperbarui otomatis tiap 20 detik
  useEffect(() => { const t = setInterval(visits.reload, 20000); return () => clearInterval(t); }, [visits.reload]);

  const counts = visits.meta?.status_count || {};
  const total = Object.values(counts).reduce((a, b) => a + b, 0);

  return (
    <>
      <PageHeader unit="reg" title="Antrean & pendaftaran" subtitle="Daftarkan kunjungan pasien dan pantau status antrean per poli."
        actions={<>
          <Button variant="secondary" icon={RefreshCw} onClick={visits.reload}>Muat ulang</Button>
          {can('registration.manage') && <Button icon={Plus} onClick={() => setRegisterOpen(true)}>Daftarkan kunjungan</Button>}
        </>} />

      <div className="panel">
        <div className="flex flex-wrap items-end gap-3 border-b border-line p-4">
          <Input label="Tanggal" type="date" value={filter.date} onChange={(e) => setFilter({ ...filter, date: e.target.value, page: 1 })} className="w-44" />
          <Select label="Poli" value={filter.poli_id} onChange={(e) => setFilter({ ...filter, poli_id: e.target.value, page: 1 })} className="w-48">
            <option value="">Semua poli</option>
            {polis.data?.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </Select>
          <Input label="Cari pasien" placeholder="Nama atau no. RM" value={filter.q} onChange={(e) => setFilter({ ...filter, q: e.target.value, page: 1 })} className="min-w-[14rem] flex-1" />
        </div>
        <div className="px-4">
          <Tabs value={filter.status} onChange={(status) => setFilter({ ...filter, status, page: 1 })}
            tabs={STATUS_TABS.map((t) => ({ ...t, count: t.value ? counts[t.value] || 0 : total }))} />
        </div>

        <ErrorBox error={visits.error} onRetry={visits.reload} />
        {visits.loading && !visits.data ? <div className="px-4"><Spinner /></div> : visits.data?.length === 0 ? (
          <Empty title="Belum ada kunjungan" action={can('registration.manage') && <Button icon={Plus} onClick={() => setRegisterOpen(true)}>Daftarkan kunjungan</Button>}>
            Tidak ada pasien terdaftar untuk filter ini.
          </Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[0.93rem]">
              <thead className="border-b border-line bg-wall/60">
                <tr><th className="th w-24">Antrean</th><th className="th">Pasien</th><th className="th">Poli / dokter</th><th className="th">Daftar</th><th className="th">Status</th><th className="th" /></tr>
              </thead>
              <tbody className="divide-y divide-line">
                {visits.data?.map((v) => (
                  <tr key={v.id} className={v.status === 'cancelled' ? 'text-ink-faint' : ''}>
                    <td className="td"><QueueTicket code={v.queue_code} tone={ticketTone(v.status)} /></td>
                    <td className="td">
                      <Link to={`/pasien/${v.patient.id}`} className="font-semibold hover:underline">{v.patient.name}</Link>
                      <p className="num text-[0.85rem] text-ink-soft">{v.patient.medical_record_no} · {v.patient.gender === 'L' ? 'L' : 'P'}, {umur(v.patient.birth_date)}</p>
                    </td>
                    <td className="td"><p>{v.poli_name}</p><p className="text-[0.85rem] text-ink-soft">{v.doctor_name}</p></td>
                    <td className="td num text-ink-soft">{jam(v.created_at)}</td>
                    <td className="td"><StatusBadge map={VISIT_STATUS} value={v.status} /></td>
                    <td className="td text-right">
                      {can('registration.manage') && v.status === 'waiting' && (
                        <Button size="sm" variant="ghost" icon={XCircle} onClick={() => setCancelVisit(v)}>Batalkan</Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pagination meta={visits.meta} onPage={(page) => setFilter({ ...filter, page })} />
      </div>

      {registerOpen && <RegisterVisitModal onClose={() => setRegisterOpen(false)} onDone={() => { visits.reload(); }} />}
      {cancelVisit && <CancelVisitModal visit={cancelVisit} onClose={() => setCancelVisit(null)}
        onDone={() => { setCancelVisit(null); visits.reload(); toast('Kunjungan dibatalkan'); }} />}
    </>
  );
}

function RegisterVisitModal({ onClose, onDone }) {
  const [step, setStep] = useState('patient');       // patient | new | schedule | done
  const [patient, setPatient] = useState(null);
  const [date, setDate] = useState(today());
  const [scheduleId, setScheduleId] = useState(null);
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);
  const schedules = useApi(() => (step === 'schedule' ? yii.get('/doctor-schedules/available', { date }) : Promise.resolve(null)), [step, date]);

  const pick = (p) => { setPatient(p); setStep('schedule'); setError(null); };
  const submit = async () => {
    setBusy(true); setError(null);
    try {
      const { data } = await yii.post('/visits', { patient_id: patient.id, schedule_id: scheduleId, visit_date: date, notes });
      setResult(data); setStep('done'); onDone();
    } catch (e) { setError(e); } finally { setBusy(false); }
  };
  const reset = () => { setPatient(null); setScheduleId(null); setNotes(''); setResult(null); setStep('patient'); };

  const titles = { patient: 'Daftarkan kunjungan: pilih pasien', new: 'Pasien baru', schedule: 'Daftarkan kunjungan: pilih dokter', done: 'Pendaftaran berhasil' };
  return (
    <Modal open title={titles[step]} onClose={onClose} width="max-w-2xl"
      footer={step === 'schedule' ? (<>
        <Button variant="secondary" onClick={() => setStep('patient')}>Ganti pasien</Button>
        <Button busy={busy} disabled={!scheduleId} onClick={submit}>Daftarkan &amp; ambil nomor antrean</Button>
      </>) : step === 'done' ? (<>
        <Button variant="secondary" onClick={onClose}>Tutup</Button>
        <Button icon={UserPlus} onClick={reset}>Daftarkan pasien lain</Button>
      </>) : null}>

      {step === 'patient' && (
        <div className="space-y-4">
          <PatientSearch onPick={pick} autoFocus />
          <div className="flex items-center justify-between rounded-md bg-wall px-4 py-3">
            <p className="text-[0.92rem] text-ink-soft">Pasien belum pernah berobat?</p>
            <Button variant="secondary" icon={UserPlus} onClick={() => setStep('new')}>Pasien baru</Button>
          </div>
        </div>
      )}

      {step === 'new' && <PatientForm onSaved={pick} onPickExisting={pick} onCancel={() => setStep('patient')} />}

      {step === 'schedule' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between rounded-md bg-rs-tint px-4 py-3">
            <div><p className="font-semibold">{patient.name}</p><p className="num text-[0.85rem] text-ink-soft">{patient.medical_record_no} · {umur(patient.birth_date)}</p></div>
          </div>
          <Input label="Tanggal kunjungan" type="date" min={today()} value={date} onChange={(e) => { setDate(e.target.value); setScheduleId(null); }} className="w-48" />
          <div>
            <p className="mb-2 text-[0.85rem] font-semibold text-ink-soft">Dokter yang praktik</p>
            {schedules.loading ? <Spinner /> : !schedules.data?.length ? (
              <p className="rounded-md bg-wall px-4 py-3 text-ink-soft">Tidak ada dokter praktik pada tanggal ini.</p>
            ) : (
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2" role="radiogroup">
                {schedules.data.map((s) => {
                  const full = s.remaining <= 0;
                  const active = scheduleId === s.schedule_id;
                  return (
                    <button key={s.schedule_id} type="button" role="radio" aria-checked={active} disabled={full} onClick={() => setScheduleId(s.schedule_id)}
                      className={`rounded-md border-2 px-3 py-2.5 text-left ${active ? 'border-rs bg-rs-tint' : 'border-line hover:border-line-strong'} disabled:cursor-not-allowed disabled:opacity-50`}>
                      <p className="font-semibold">{s.poli_name}</p>
                      <p className="text-[0.9rem]">{s.doctor_name}</p>
                      <p className="num mt-1 text-[0.82rem] text-ink-soft">{s.start_time.slice(0, 5)}–{s.end_time.slice(0, 5)} · {full ? 'kuota penuh' : `sisa ${s.remaining} dari ${s.quota}`}</p>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
          <Textarea label="Catatan (opsional)" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          <ErrorBox error={error} />
        </div>
      )}

      {step === 'done' && result && (
        <div className="flex flex-col items-center gap-3 py-4 text-center">
          <QueueTicket code={result.queue_code} size="lg" tone="wait" />
          <p className="text-lg font-bold">{result.patient.name}</p>
          <p className="text-ink-soft">{result.poli_name} · {result.doctor_name}</p>
          <p className="text-[0.9rem] text-ink-soft">Tagihan biaya pendaftaran sudah dibuat otomatis.</p>
        </div>
      )}
    </Modal>
  );
}

function CancelVisitModal({ visit, onClose, onDone }) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const submit = async () => {
    setBusy(true); setError(null);
    try { await yii.post(`/visits/${visit.id}/cancel`, { reason }); onDone(); }
    catch (e) { setError(e); } finally { setBusy(false); }
  };
  return (
    <Modal open title={`Batalkan kunjungan ${visit.queue_code}`} onClose={onClose}
      footer={<><Button variant="secondary" onClick={onClose}>Kembali</Button><Button variant="danger" busy={busy} onClick={submit}>Batalkan kunjungan</Button></>}>
      <p className="mb-3 text-[0.92rem] text-ink-soft">{visit.patient.name} di {visit.poli_name}. Biaya pendaftaran ikut dibatalkan dari tagihan.</p>
      <Textarea label="Alasan pembatalan" value={reason} onChange={(e) => setReason(e.target.value)} error={error?.fieldErrors?.().reason} placeholder="Contoh: pasien pulang sebelum dipanggil" />
      {error && <div className="mt-3"><ErrorBox error={error} /></div>}
    </Modal>
  );
}

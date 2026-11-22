import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Megaphone, RefreshCw } from 'lucide-react';
import { yii } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { PageHeader } from '../components/Layout';
import { Button, Empty, ErrorBox, Input, QueueTicket, Spinner, StatusBadge, useToast } from '../components/ui';
import { today, umur, VISIT_STATUS } from '../lib/format';
import { useApi } from '../lib/useApi';

export default function DoctorQueue() {
  const { can, user } = useAuth();
  const nav = useNavigate();
  const toast = useToast();
  const [date, setDate] = useState(today());
  const [calling, setCalling] = useState(null);
  const q = useApi(() => yii.get('/examinations/queue', { date, status: 'waiting,in_exam,exam_done,completed' }), [date]);
  useEffect(() => { const t = setInterval(q.reload, 20000); return () => clearInterval(t); }, [q.reload]);

  const call = async (v) => {
    setCalling(v.id);
    try { await yii.post(`/visits/${v.id}/call`); nav(`/pemeriksaan/${v.id}`); }
    catch (e) { toast(e.message, 'error'); setCalling(null); }
  };

  const rows = q.data || [];
  const waiting = rows.filter((v) => v.status === 'waiting');
  const active = rows.filter((v) => v.status === 'in_exam');
  const done = rows.filter((v) => ['exam_done', 'completed'].includes(v.status));
  const next = waiting[0];

  return (
    <>
      <PageHeader unit="exam" title="Antrean dokter" subtitle={user.role === 'admin' ? 'Semua dokter' : user.full_name}
        actions={<><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} aria-label="Tanggal" /><Button variant="secondary" icon={RefreshCw} onClick={q.reload}>Muat ulang</Button></>} />
      <ErrorBox error={q.error} onRetry={q.reload} />
      {q.loading && !q.data ? <Spinner /> : (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
          <section className="panel flex flex-col items-center justify-center gap-4 px-6 py-10 text-center">
            {active.length > 0 ? (<>
              <p className="font-semibold text-ink-soft">Sedang diperiksa</p>
              <QueueTicket code={active[0].queue_code} size="lg" tone="exam" />
              <p className="text-xl font-bold">{active[0].patient.name}</p>
              <Button onClick={() => nav(`/pemeriksaan/${active[0].id}`)}>Lanjutkan pemeriksaan</Button>
            </>) : next ? (<>
              <p className="font-semibold text-ink-soft">Antrean berikutnya</p>
              <QueueTicket code={next.queue_code} size="lg" tone="wait" />
              <p className="text-xl font-bold">{next.patient.name}</p>
              <p className="text-ink-soft">{next.patient.gender === 'L' ? 'Laki-laki' : 'Perempuan'}, {umur(next.patient.birth_date)}</p>
              {can('exam.manage') && <Button icon={Megaphone} busy={calling === next.id} onClick={() => call(next)}>Panggil pasien</Button>}
            </>) : (
              <Empty title="Tidak ada pasien menunggu">Pasien yang didaftarkan ke Anda akan muncul di sini.</Empty>
            )}
            <p className="num text-[0.9rem] text-ink-soft">{waiting.length} menunggu · {active.length} diperiksa · {done.length} selesai</p>
          </section>

          <section className="panel">
            <h2 className="border-b border-line px-4 py-3 font-bold">Daftar pasien hari ini</h2>
            {rows.length === 0 ? <Empty title="Belum ada pasien" /> : (
              <ul className="divide-y divide-line">
                {rows.map((v) => (
                  <li key={v.id} className="flex items-center gap-4 px-4 py-3">
                    <QueueTicket code={v.queue_code} tone={{ waiting: 'wait', in_exam: 'exam' }[v.status] || 'done'} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold">{v.patient.name}</p>
                      <p className="num text-[0.85rem] text-ink-soft">{v.patient.medical_record_no} · {umur(v.patient.birth_date)}{user.role === 'admin' && ` · ${v.doctor_name}`}</p>
                    </div>
                    <StatusBadge map={VISIT_STATUS} value={v.status} />
                    {v.status === 'waiting' && can('exam.manage')
                      ? <Button size="sm" variant="secondary" busy={calling === v.id} onClick={() => call(v)}>Panggil</Button>
                      : <Button size="sm" variant="secondary" onClick={() => nav(`/pemeriksaan/${v.id}`)}>{v.status === 'in_exam' ? 'Lanjutkan' : 'Lihat'}</Button>}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
    </>
  );
}

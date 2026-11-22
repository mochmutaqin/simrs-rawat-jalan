/**
 * SIMRS Rawat Jalan
 *
 * @author  Mochamad Mutaqin Kurniawan <mochmutaqin@gmail.com>
 * @link    https://github.com/mochmutaqin/simrs-rawat-jalan
 */

import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Pencil, Plus } from 'lucide-react';
import { yii } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { PageHeader } from '../components/Layout';
import PatientForm from '../components/PatientForm';
import { Badge, Button, Empty, ErrorBox, Input, Modal, Pagination, Spinner, StatusBadge, Tabs, useToast } from '../components/ui';
import { INVOICE_STATUS, rupiah, tanggal, umur, VISIT_STATUS, waktu } from '../lib/format';
import { useApi } from '../lib/useApi';

export function PatientList() {
  const { can } = useAuth();
  const toast = useToast();
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState(null);
  const list = useApi(() => yii.get('/patients', { q, page, limit: 20 }), [q, page]);

  return (
    <>
      <PageHeader unit="reg" title="Data pasien" subtitle="Nomor rekam medis dibuat otomatis saat pasien didaftarkan."
        actions={can('patient.manage') && <Button icon={Plus} onClick={() => setEditing({})}>Pasien baru</Button>} />
      <div className="panel">
        <div className="border-b border-line p-4">
          <Input placeholder="Cari no. RM, NIK, atau nama" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} className="max-w-md" />
        </div>
        <ErrorBox error={list.error} onRetry={list.reload} />
        {list.loading && !list.data ? <div className="px-4"><Spinner /></div> : list.data?.length === 0 ? <Empty title="Pasien tidak ditemukan" /> : (
          <div className="overflow-x-auto">
            <table className="w-full text-[0.93rem]">
              <thead className="border-b border-line bg-wall/60"><tr><th className="th">No. RM</th><th className="th">Nama</th><th className="th">NIK</th><th className="th">Lahir</th><th className="th">Kontak</th><th className="th" /></tr></thead>
              <tbody className="divide-y divide-line">
                {list.data?.map((p) => (
                  <tr key={p.id}>
                    <td className="td num font-semibold">{p.medical_record_no}</td>
                    <td className="td"><Link to={`/pasien/${p.id}`} className="font-semibold hover:underline">{p.name}</Link><p className="text-[0.85rem] text-ink-soft">{p.gender === 'L' ? 'Laki-laki' : 'Perempuan'}, {umur(p.birth_date)}</p></td>
                    <td className="td num text-ink-soft">{p.nik || '-'}</td>
                    <td className="td num">{tanggal(p.birth_date)}</td>
                    <td className="td text-ink-soft">{p.phone || '-'}</td>
                    <td className="td text-right">{can('patient.manage') && <Button size="sm" variant="ghost" icon={Pencil} onClick={() => setEditing(p)}>Ubah</Button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pagination meta={list.meta} onPage={setPage} />
      </div>
      {editing && (
        <Modal open title={editing.id ? `Ubah data ${editing.name}` : 'Pasien baru'} onClose={() => setEditing(null)} width="max-w-2xl">
          <PatientForm initial={editing.id ? editing : null} onCancel={() => setEditing(null)}
            onSaved={(p) => { setEditing(null); list.reload(); toast(editing.id ? 'Data pasien disimpan' : `Pasien ${p.medical_record_no} dibuat`); }} />
        </Modal>
      )}
    </>
  );
}

export function PatientDetail() {
  const { id } = useParams();
  const { can } = useAuth();
  const patient = useApi(() => yii.get(`/patients/${id}`), [id]);
  const tabs = [
    { value: 'visits', label: 'Riwayat kunjungan', show: can('queue.view', 'exam.view', 'billing.view') },
    { value: 'records', label: 'Rekam medis', show: can('exam.view') },
    { value: 'meds', label: 'Riwayat obat', show: can('prescription.view', 'exam.view') },
    { value: 'payments', label: 'Riwayat pembayaran', show: can('billing.view') },
  ].filter((t) => t.show);
  const [tab, setTab] = useState(tabs[0]?.value);

  if (patient.loading && !patient.data) return <Spinner />;
  if (patient.error) return <ErrorBox error={patient.error} />;
  const p = patient.data;

  return (
    <>
      <PageHeader unit="reg" title={p.name} subtitle={`${p.medical_record_no} · ${p.gender === 'L' ? 'Laki-laki' : 'Perempuan'}, ${umur(p.birth_date)} · lahir ${tanggal(p.birth_date)}`} />
      <div className="mb-6 grid grid-cols-1 gap-4 text-[0.92rem] sm:grid-cols-3">
        <Info label="NIK" value={p.nik || 'Tidak ada'} />
        <Info label="Nomor HP" value={p.phone || '-'} />
        <Info label="Alamat" value={p.address || '-'} />
      </div>
      <Tabs tabs={tabs} value={tab} onChange={setTab} />
      <div className="mt-4">
        {tab === 'visits' && <VisitHistory patientId={id} />}
        {tab === 'records' && <MedicalRecords patientId={id} />}
        {tab === 'meds' && <Medications patientId={id} />}
        {tab === 'payments' && <Payments patientId={id} />}
      </div>
    </>
  );
}

const Info = ({ label, value }) => (
  <div className="border-l-2 border-line pl-3"><p className="text-[0.82rem] font-semibold text-ink-soft">{label}</p><p className="num mt-0.5">{value}</p></div>
);

function VisitHistory({ patientId }) {
  const [page, setPage] = useState(1);
  const r = useApi(() => yii.get(`/patients/${patientId}/visits`, { page, limit: 15 }), [patientId, page]);
  if (r.loading && !r.data) return <Spinner />;
  if (!r.data?.length) return <Empty title="Belum ada kunjungan" />;
  return (
    <div className="panel overflow-x-auto">
      <table className="w-full text-[0.93rem]">
        <thead className="border-b border-line bg-wall/60"><tr><th className="th">Tanggal</th><th className="th">Antrean</th><th className="th">Poli / dokter</th><th className="th">Status</th></tr></thead>
        <tbody className="divide-y divide-line">
          {r.data.map((v) => (
            <tr key={v.id}><td className="td num">{tanggal(v.visit_date)}</td><td className="td num font-semibold">{v.queue_code}</td>
              <td className="td">{v.poli_name}<p className="text-[0.85rem] text-ink-soft">{v.doctor_name}</p></td>
              <td className="td"><StatusBadge map={VISIT_STATUS} value={v.status} /></td></tr>
          ))}
        </tbody>
      </table>
      <Pagination meta={r.meta} onPage={setPage} />
    </div>
  );
}

export function MedicalRecords({ patientId, excludeVisitId }) {
  const r = useApi(() => yii.get(`/patients/${patientId}/medical-records`), [patientId]);
  if (r.loading && !r.data) return <Spinner />;
  if (r.error) return <ErrorBox error={r.error} />;
  const visits = (r.data?.visits || []).filter((v) => v.visit_id !== excludeVisitId);
  if (!visits.length) return <Empty title="Belum ada riwayat rekam medis" />;
  return (
    <ol className="space-y-4">
      {visits.map((v) => {
        const e = v.examination;
        return (
          <li key={v.visit_id} className="panel p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="font-bold">{tanggal(v.visit_date)} · {v.poli}</p>
              <p className="text-[0.88rem] text-ink-soft">{v.doctor}</p>
            </div>
            {!e ? <p className="mt-2 text-ink-soft">Belum diperiksa.</p> : (
              <div className="mt-3 grid grid-cols-1 gap-4 text-[0.92rem] md:grid-cols-2">
                <div>
                  <p className="font-semibold text-ink-soft">Keluhan & anamnesis</p>
                  <p>{e.chief_complaint || '-'}</p>
                  {e.anamnesis && <p className="mt-1 text-ink-soft">{e.anamnesis}</p>}
                  <p className="num mt-2 text-[0.85rem] text-ink-soft">
                    TD {e.bp_systolic ?? '-'}/{e.bp_diastolic ?? '-'} · Nadi {e.heart_rate ?? '-'} · RR {e.resp_rate ?? '-'} · Suhu {e.temperature ?? '-'}°C · SpO₂ {e.spo2 ?? '-'}%
                  </p>
                </div>
                <div>
                  <p className="font-semibold text-ink-soft">Diagnosis</p>
                  <ul>{e.diagnoses.map((d) => <li key={d.id}><span className="num font-semibold">{d.icd10_code}</span> {d.diagnosis_name} {d.diagnosis_type === 'primary' && <Badge tone="exam">utama</Badge>}</li>)}</ul>
                </div>
                {v.procedures.length > 0 && <div><p className="font-semibold text-ink-soft">Tindakan</p><ul>{v.procedures.map((t, i) => <li key={i}>{t.name}{t.quantity > 1 && ` ×${t.quantity}`}</li>)}</ul></div>}
                {v.medications.length > 0 && <div><p className="font-semibold text-ink-soft">Obat</p><ul>{v.medications.map((m, i) => <li key={i}>{m.name} · {m.dose}, {m.frequency} <span className="num text-ink-soft">({m.quantity} {m.unit})</span></li>)}</ul></div>}
                {v.lab_results.length > 0 && (
                  <div className="md:col-span-2"><p className="font-semibold text-ink-soft">Hasil laboratorium</p>
                    <ul className="num">{v.lab_results.map((l, i) => (
                      <li key={i}>{l.name}: {l.result_value ? <><b>{l.result_value}</b> {l.result_unit} <span className="text-ink-soft">(rujukan {l.ref_range || '-'})</span>{l.result_flag && l.result_flag !== 'normal' && <span className="ml-1 font-semibold text-st-danger">{l.result_flag}</span>}</> : <span className="text-ink-soft">menunggu hasil</span>}</li>
                    ))}</ul>
                  </div>
                )}
              </div>
            )}
          </li>
        );
      })}
    </ol>
  );
}

function Medications({ patientId }) {
  const [page, setPage] = useState(1);
  const r = useApi(() => yii.get(`/patients/${patientId}/medications`, { page, limit: 20 }), [patientId, page]);
  if (r.loading && !r.data) return <Spinner />;
  if (!r.data?.length) return <Empty title="Belum ada riwayat obat" />;
  return (
    <div className="panel overflow-x-auto">
      <table className="w-full text-[0.93rem]">
        <thead className="border-b border-line bg-wall/60"><tr><th className="th">Tanggal</th><th className="th">Obat</th><th className="th">Aturan pakai</th><th className="th text-right">Jumlah</th><th className="th">Dokter</th><th className="th">Status</th></tr></thead>
        <tbody className="divide-y divide-line">
          {r.data.map((m, i) => (
            <tr key={i}><td className="td num">{tanggal(m.visit_date)}</td><td className="td font-semibold">{m.name}</td><td className="td">{m.dose}, {m.frequency}</td>
              <td className="td num text-right">{m.quantity} {m.unit}</td><td className="td text-ink-soft">{m.doctor}</td>
              <td className="td">{m.status === 'dispensed' ? <Badge tone="done">Diserahkan</Badge> : <Badge tone="wait">Menunggu</Badge>}</td></tr>
          ))}
        </tbody>
      </table>
      <Pagination meta={r.meta} onPage={setPage} />
    </div>
  );
}

function Payments({ patientId }) {
  const [page, setPage] = useState(1);
  const r = useApi(() => yii.get(`/patients/${patientId}/payments`, { page, limit: 20 }), [patientId, page]);
  if (r.loading && !r.data) return <Spinner />;
  if (!r.data?.length) return <Empty title="Belum ada pembayaran" />;
  return (
    <div className="panel overflow-x-auto">
      <table className="w-full text-[0.93rem]">
        <thead className="border-b border-line bg-wall/60"><tr><th className="th">Waktu</th><th className="th">No. bukti</th><th className="th">Invoice</th><th className="th">Metode</th><th className="th text-right">Jumlah</th></tr></thead>
        <tbody className="divide-y divide-line">
          {r.data.map((p) => (
            <tr key={p.id}><td className="td num">{waktu(p.paid_at)}</td><td className="td num">{p.receipt_no}</td>
              <td className="td"><Link className="num hover:underline" to={`/kasir/${p.invoice_id}`}>{p.invoice_no}</Link><p className="text-[0.85rem] text-ink-soft">{p.poli}</p></td>
              <td className="td">{p.method === 'cash' ? 'Tunai' : `Non-tunai (${String(p.channel).toUpperCase()})`}</td>
              <td className={`td num text-right font-semibold ${p.kind === 'refund' ? 'text-st-danger' : ''}`}>{p.kind === 'refund' ? '−' : ''}{rupiah(p.amount)}</td></tr>
          ))}
        </tbody>
      </table>
      <Pagination meta={r.meta} onPage={setPage} />
    </div>
  );
}

export { INVOICE_STATUS };

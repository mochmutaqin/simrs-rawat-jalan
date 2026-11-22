/**
 * SIMRS Rawat Jalan
 *
 * @author  Mochamad Mutaqin Kurniawan <mochmutaqin@gmail.com>
 * @link    https://github.com/mochmutaqin/simrs-rawat-jalan
 */

import { useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Pencil, Plus, Power } from 'lucide-react';
import { yii } from '../api/client';
import { PageHeader } from '../components/Layout';
import { Badge, Button, Empty, ErrorBox, Input, Modal, PasswordInput, Pagination, Select, Spinner, useToast } from '../components/ui';
import { rupiah } from '../lib/format';
import { useApi } from '../lib/useApi';

const DAYS = ['', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu', 'Minggu'];
const STAFF_TYPE = { doctor: 'Dokter', nurse: 'Perawat', pharmacist: 'Apoteker', lab_analyst: 'Analis lab' };

/**
 * Konfigurasi CRUD master data. Satu komponen generik melayani semua tabel,
 * aturan validasi & anti duplikasi tetap di backend (Yii) dan ditampilkan per field.
 */
const RESOURCES = {
  polis: {
    title: 'Poli', subtitle: 'Unit pelayanan rawat jalan dan biaya pendaftarannya.', singular: 'poli',
    columns: [['code', 'Kode'], ['name', 'Nama poli'], ['registration_fee', 'Biaya pendaftaran', rupiah]],
    fields: [['code', 'Kode', 'text'], ['name', 'Nama poli', 'text'], ['registration_fee', 'Biaya pendaftaran (Rp)', 'number']],
  },
  'medical-staff': {
    title: 'Dokter & tenaga medis', subtitle: 'Dokter, perawat, apoteker, dan analis laboratorium.', singular: 'tenaga medis',
    filters: [['staff_type', 'Semua jenis', STAFF_TYPE]],
    columns: [['name', 'Nama'], ['staff_type', 'Jenis', (v) => STAFF_TYPE[v]], ['specialization', 'Spesialisasi'], ['str_no', 'No. STR/SIP'], ['phone', 'Telepon']],
    fields: [['name', 'Nama lengkap', 'text'], ['staff_type', 'Jenis', 'select', STAFF_TYPE], ['specialization', 'Spesialisasi', 'text'],
      ['str_no', 'No. STR/SIP', 'text'], ['phone', 'Telepon', 'text'], ['user_id', 'Akun login', 'user']],
  },
  'doctor-schedules': {
    title: 'Jadwal praktik', subtitle: 'Hari, jam, dan kuota pasien per dokter. Jadwal yang bentrok ditolak.', singular: 'jadwal', searchable: false,
    columns: [['doctor_name', 'Dokter'], ['poli_name', 'Poli'], ['day_name', 'Hari'], ['start_time', 'Jam', (v, r) => `${v.slice(0, 5)}–${r.end_time.slice(0, 5)}`], ['quota', 'Kuota']],
    fields: [['doctor_id', 'Dokter', 'doctor'], ['poli_id', 'Poli', 'poli'], ['day_of_week', 'Hari', 'select', Object.fromEntries(DAYS.slice(1).map((d, i) => [i + 1, d]))],
      ['start_time', 'Jam mulai', 'time'], ['end_time', 'Jam selesai', 'time'], ['quota', 'Kuota pasien', 'number']],
    defaults: { quota: 30, start_time: '08:00', end_time: '14:00' },
  },
  procedures: {
    title: 'Tindakan & tarif', subtitle: 'Tarif disalin ke tagihan saat tindakan dicatat; perubahan tarif tidak mengubah tagihan lama.', singular: 'tindakan',
    columns: [['code', 'Kode'], ['name', 'Nama tindakan'], ['price', 'Tarif', rupiah]],
    fields: [['code', 'Kode', 'text'], ['name', 'Nama tindakan', 'text'], ['price', 'Tarif (Rp)', 'number']],
  },
  'lab-tests': {
    title: 'Jenis pemeriksaan lab', subtitle: 'Daftar pemeriksaan laboratorium, satuan, dan nilai rujukan.', singular: 'pemeriksaan',
    columns: [['code', 'Kode'], ['name', 'Nama'], ['unit', 'Satuan'], ['ref_range', 'Nilai rujukan'], ['price', 'Tarif', rupiah]],
    fields: [['code', 'Kode', 'text'], ['name', 'Nama pemeriksaan', 'text'], ['unit', 'Satuan', 'text'], ['ref_range', 'Nilai rujukan', 'text'], ['price', 'Tarif (Rp)', 'number']],
  },
  users: {
    title: 'Pengguna & hak akses', subtitle: 'Setiap pengguna hanya bisa membuka fitur sesuai role-nya.', singular: 'pengguna',
    columns: [['username', 'Username'], ['full_name', 'Nama'], ['role', 'Role', (v) => ROLE_LABEL[v] || v], ['last_login_at', 'Login terakhir', (v) => (v ? new Date(v).toLocaleString('id-ID') : 'belum pernah')]],
    fields: [['username', 'Username', 'text'], ['full_name', 'Nama lengkap', 'text'], ['email', 'Email', 'email'], ['role', 'Role', 'role'], ['password', 'Password', 'password']],
  },
};
const ROLE_LABEL = { admin: 'Administrator', registration: 'Petugas pendaftaran', doctor: 'Dokter', pharmacy: 'Petugas farmasi', lab: 'Petugas laboratorium', cashier: 'Kasir' };

export default function MasterData() {
  const { resource } = useParams();
  const cfg = RESOURCES[resource];
  if (!cfg) return <Empty title="Halaman tidak ditemukan" />;
  return <CrudPage key={resource} resource={resource} cfg={cfg} />;
}

function CrudPage({ resource, cfg }) {
  const toast = useToast();
  const [q, setQ] = useState('');
  const [filters, setFilters] = useState({});
  const [active, setActive] = useState('true');
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState(null);
  const list = useApi(() => yii.get(`/${resource}`, { q, page, limit: 20, is_active: resource === 'users' ? undefined : active, ...filters }), [resource, q, page, active, JSON.stringify(filters)]);

  const toggle = async (row) => {
    try {
      if (row.is_active) await yii.del(`/${resource}/${row.id}`);
      else await yii.put(`/${resource}/${row.id}`, { is_active: true });
      list.reload(); toast(row.is_active ? 'Dinonaktifkan' : 'Diaktifkan kembali');
    } catch (e) { toast(e.message, 'error'); }
  };

  return (
    <>
      <PageHeader unit="admin" title={cfg.title} subtitle={cfg.subtitle} actions={<Button icon={Plus} onClick={() => setEditing({ ...(cfg.defaults || {}) })}>Tambah {cfg.singular}</Button>} />
      <div className="panel">
        <div className="flex flex-wrap items-end gap-3 border-b border-line p-4">
          {cfg.searchable !== false && <Input placeholder="Cari…" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} className="min-w-[14rem] flex-1" />}
          {cfg.filters?.map(([k, label, opts]) => (
            <Select key={k} aria-label={label} value={filters[k] || ''} onChange={(e) => { setFilters({ ...filters, [k]: e.target.value }); setPage(1); }}>
              <option value="">{label}</option>{Object.entries(opts).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </Select>
          ))}
          <Select aria-label="Status" value={active} onChange={(e) => { setActive(e.target.value); setPage(1); }}>
            <option value="true">Aktif</option><option value="false">Nonaktif</option><option value="">Semua</option>
          </Select>
        </div>
        <ErrorBox error={list.error} onRetry={list.reload} />
        {list.loading && !list.data ? <div className="px-4"><Spinner /></div> : !list.data?.length ? <Empty title="Belum ada data" /> : (
          <div className="overflow-x-auto">
            <table className="w-full text-[0.93rem]">
              <thead className="border-b border-line bg-wall/60"><tr>{cfg.columns.map(([k, l]) => <th key={k} className="th">{l}</th>)}<th className="th">Status</th><th className="th" /></tr></thead>
              <tbody className="divide-y divide-line">
                {list.data.map((row) => (
                  <tr key={row.id} className={row.is_active ? '' : 'text-ink-faint'}>
                    {cfg.columns.map(([k, , fmt], i) => <td key={k} className={`td ${i === 0 ? 'font-semibold' : ''} ${fmt === rupiah ? 'num' : ''}`}>{fmt ? fmt(row[k], row) : row[k] ?? '-'}</td>)}
                    <td className="td">{row.is_active ? <Badge tone="done">Aktif</Badge> : <Badge tone="cancel">Nonaktif</Badge>}</td>
                    <td className="td whitespace-nowrap text-right">
                      <Button size="sm" variant="ghost" icon={Pencil} onClick={() => setEditing(row)}>Ubah</Button>
                      <Button size="sm" variant="ghost" icon={Power} onClick={() => toggle(row)}>{row.is_active ? 'Nonaktifkan' : 'Aktifkan'}</Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pagination meta={list.meta} onPage={setPage} />
      </div>
      {editing && <CrudForm resource={resource} cfg={cfg} row={editing} onClose={() => setEditing(null)}
        onSaved={() => { setEditing(null); list.reload(); toast(`${cfg.singular[0].toUpperCase()}${cfg.singular.slice(1)} disimpan`); }} />}
    </>
  );
}

function CrudForm({ resource, cfg, row, onClose, onSaved }) {
  const isNew = !row.id;
  const [form, setForm] = useState(() => Object.fromEntries(cfg.fields.map(([k]) => [k, row[k] ?? (k === 'password' ? '' : '')])));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const errors = error?.fieldErrors?.() || {};
  const needs = useMemo(() => new Set(cfg.fields.map((f) => f[2])), [cfg]);
  const doctors = useApi(() => (needs.has('doctor') ? yii.get('/medical-staff', { staff_type: 'doctor', is_active: true, limit: 100 }) : Promise.resolve(null)), []);
  const polis = useApi(() => (needs.has('poli') ? yii.get('/polis', { is_active: true, limit: 100 }) : Promise.resolve(null)), []);
  const users = useApi(() => (needs.has('user') ? yii.get('/users', { limit: 100 }).catch(() => ({ data: [] })) : Promise.resolve(null)), []);
  const roles = useApi(() => (needs.has('role') ? yii.get('/users/roles') : Promise.resolve(null)), []);

  const save = async () => {
    setBusy(true); setError(null);
    const body = {};
    cfg.fields.forEach(([k, , type]) => {
      let v = form[k];
      if (type === 'password' && !v) return;               // kosong = tidak diubah
      if (['number', 'doctor', 'poli', 'user'].includes(type) || k === 'day_of_week') v = v === '' || v === null ? null : Number(v);
      body[k] = v;
    });
    try { isNew ? await yii.post(`/${resource}`, body) : await yii.put(`/${resource}/${row.id}`, body); onSaved(); }
    catch (e) { setError(e); setBusy(false); }
  };

  const input = ([k, label, type, opts]) => {
    const common = { label, value: form[k] ?? '', error: errors[k] ?? (k === 'role' ? errors.role_id : undefined), onChange: (e) => setForm({ ...form, [k]: e.target.value }) };
    if (type === 'select') return <Select {...common}><option value="">Pilih</option>{Object.entries(opts).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select>;
    if (type === 'doctor') return <Select {...common}><option value="">Pilih dokter</option>{doctors.data?.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</Select>;
    if (type === 'poli') return <Select {...common}><option value="">Pilih poli</option>{polis.data?.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select>;
    if (type === 'user') return <Select {...common} hint="Hubungkan agar dokter bisa login dan melihat pasiennya"><option value="">Tidak dihubungkan</option>{users.data?.map((u) => <option key={u.id} value={u.id}>{u.username} ({u.full_name})</option>)}</Select>;
    if (type === 'role') return <Select {...common}><option value="">Pilih role</option>{roles.data?.map((r) => <option key={r.code} value={r.code}>{r.name}</option>)}</Select>;
    if (type === 'password') return <PasswordInput {...common} autoComplete="new-password" hint={isNew ? 'Minimal 8 karakter' : 'Kosongkan bila tidak diubah'} />;
    return <Input {...common} type={type} step={type === 'number' ? 'any' : undefined} />;
  };

  return (
    <Modal open title={isNew ? `Tambah ${cfg.singular}` : `Ubah ${cfg.singular}`} onClose={onClose}
      footer={<><Button variant="secondary" onClick={onClose}>Batal</Button><Button busy={busy} onClick={save}>Simpan</Button></>}>
      <form className="grid grid-cols-1 gap-3 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); save(); }}>
        {cfg.fields.map((f) => <div key={f[0]} className={['name', 'full_name'].includes(f[0]) ? 'sm:col-span-2' : ''}>{input(f)}</div>)}
        <button type="submit" hidden />
      </form>
      {error && !Object.keys(errors).length && <div className="mt-3"><ErrorBox error={error} /></div>}
    </Modal>
  );
}

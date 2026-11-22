import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { Button, ErrorBox, Input } from '../components/ui';

const DEMO = [
  ['admin', 'Administrator', 'bg-unit-admin'],
  ['pendaftaran', 'Petugas pendaftaran', 'bg-unit-reg'],
  ['dokter.umum', 'Dokter poli umum', 'bg-unit-exam'],
  ['farmasi', 'Petugas farmasi', 'bg-unit-pharm'],
  ['lab', 'Petugas laboratorium', 'bg-unit-lab'],
  ['kasir', 'Kasir', 'bg-unit-cash'],
];

export default function Login() {
  const { user, login } = useAuth();
  const [form, setForm] = useState({ username: '', password: '' });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to="/" replace />;

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setError(null);
    try { await login(form.username, form.password); }
    catch (err) { setError(err); }
    finally { setBusy(false); }
  };

  return (
    <div className="grid min-h-screen lg:grid-cols-[1fr_minmax(420px,520px)]">
      <section className="relative hidden flex-col justify-between overflow-hidden bg-[#10302C] p-12 text-white lg:flex">
        <div className="flex items-center gap-3">
          <img src="/favicon.svg" alt="" className="h-10 w-10" />
          <p className="text-lg font-extrabold">SIMRS Rawat Jalan</p>
        </div>
        <div className="max-w-lg">
          <h1 className="text-[2.6rem] font-extrabold leading-[1.1]">Dari loket pendaftaran sampai kasir, satu alur.</h1>
          <p className="mt-4 text-lg text-white/70">Antrean, rekam medis, resep, laboratorium, dan tagihan pasien rawat jalan tercatat dalam satu sistem.</p>
        </div>
        {/* pita penunjuk arah: urutan unit yang dilalui pasien */}
        <ol className="flex flex-wrap gap-x-6 gap-y-3 text-[0.9rem]">
          {[['Pendaftaran', 'bg-unit-reg'], ['Pemeriksaan', 'bg-unit-exam'], ['Farmasi', 'bg-unit-pharm'], ['Laboratorium', 'bg-unit-lab'], ['Kasir', 'bg-unit-cash']].map(([n, c]) => (
            <li key={n} className="flex items-center gap-2"><span className={`h-3 w-8 rounded-sm ${c}`} aria-hidden />{n}</li>
          ))}
        </ol>
      </section>

      <section className="flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm">
          <h2 className="text-2xl font-extrabold">Masuk</h2>
          <p className="mt-1 text-ink-soft">Gunakan akun petugas Anda.</p>
          <form onSubmit={submit} className="mt-6 space-y-4">
            <Input label="Username" autoComplete="username" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} required />
            <Input label="Password" type="password" autoComplete="current-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required />
            <ErrorBox error={error} />
            <Button type="submit" busy={busy} className="w-full">Masuk</Button>
          </form>

          <div className="mt-10 border-t border-line pt-5">
            <p className="text-[0.85rem] font-semibold text-ink-soft">Akun demo (password: password123)</p>
            <ul className="mt-2 grid grid-cols-2 gap-1.5">
              {DEMO.map(([u, label, color]) => (
                <li key={u}>
                  <button type="button" onClick={() => setForm({ username: u, password: 'password123' })}
                    className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[0.85rem] hover:bg-white">
                    <span className={`h-2.5 w-2.5 shrink-0 rounded-sm ${color}`} aria-hidden />
                    <span><span className="block font-semibold">{u}</span><span className="text-ink-faint">{label}</span></span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>
    </div>
  );
}

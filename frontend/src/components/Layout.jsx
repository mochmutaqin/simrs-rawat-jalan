/**
 * SIMRS Rawat Jalan
 *
 * @author  Mochamad Mutaqin Kurniawan <mochmutaqin@gmail.com>
 * @link    https://github.com/mochmutaqin/simrs-rawat-jalan
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import {
  BarChart3, Building2, CalendarClock, ClipboardList, FileSpreadsheet, FlaskConical, LogOut, Menu, Pill, ReceiptText,
  Stethoscope, Syringe, TestTube2, UserCog, UserRound, Users, Wallet, X,
} from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { tanggalPanjang, today } from '../lib/format';

/**
 * Menu dikelompokkan per unit pelayanan, masing-masing dengan warna penunjuk arahnya.
 * Item hanya muncul bila user punya permission-nya (sama dengan RBAC di backend).
 */
export const NAV = [
  { unit: 'Dashboard & laporan', color: 'bg-unit-dash', items: [
    { to: '/dashboard', label: 'Dashboard', icon: BarChart3, perms: ['report.view'] },
    { to: '/laporan', label: 'Laporan', icon: FileSpreadsheet, perms: ['report.view', 'medicine.manage'] },
  ] },
  { unit: 'Pendaftaran', color: 'bg-unit-reg', items: [
    { to: '/pendaftaran', label: 'Antrean & pendaftaran', icon: ClipboardList, perms: ['registration.manage', 'queue.view'] },
    { to: '/pasien', label: 'Data pasien', icon: Users, perms: ['patient.manage', 'exam.view', 'billing.view'] },
  ] },
  { unit: 'Pemeriksaan', color: 'bg-unit-exam', items: [
    { to: '/pemeriksaan', label: 'Antrean dokter', icon: Stethoscope, perms: ['exam.manage', 'exam.view'] },
  ] },
  { unit: 'Farmasi', color: 'bg-unit-pharm', items: [
    { to: '/farmasi', label: 'Resep masuk', icon: Pill, perms: ['pharmacy.process'] },
    { to: '/farmasi/stok', label: 'Stok obat', icon: Syringe, perms: ['medicine.manage'] },
  ] },
  { unit: 'Laboratorium', color: 'bg-unit-lab', items: [
    { to: '/lab', label: 'Permintaan lab', icon: FlaskConical, perms: ['lab.result', 'lab.view'] },
  ] },
  { unit: 'Kasir', color: 'bg-unit-cash', items: [
    { to: '/kasir', label: 'Tagihan & pembayaran', icon: Wallet, perms: ['billing.view'] },
  ] },
  { unit: 'Master data', color: 'bg-unit-admin', items: [
    { to: '/master/polis', label: 'Poli', icon: Building2, perms: ['master.manage'] },
    { to: '/master/medical-staff', label: 'Dokter & tenaga medis', icon: UserRound, perms: ['master.manage'] },
    { to: '/master/doctor-schedules', label: 'Jadwal praktik', icon: CalendarClock, perms: ['master.manage'] },
    { to: '/master/procedures', label: 'Tindakan & tarif', icon: ReceiptText, perms: ['master.manage'] },
    { to: '/master/lab-tests', label: 'Jenis pemeriksaan lab', icon: TestTube2, perms: ['master.manage'] },
    { to: '/master/users', label: 'Pengguna & hak akses', icon: UserCog, perms: ['user.manage'] },
  ] },
];

export function firstAllowedPath(can) {
  for (const g of NAV) for (const i of g.items) if (can(...i.perms)) return i.to;
  return '/forbidden';
}

export default function Layout() {
  const { user, logout, can } = useAuth();
  const loc = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuButton = useRef(null);
  const groups = NAV.map((g) => ({ ...g, items: g.items.filter((i) => can(...i.perms)) })).filter((g) => g.items.length);

  // menu HP/tablet: tutup otomatis setelah pindah halaman
  useEffect(() => { setMenuOpen(false); }, [loc.pathname]);
  const closeMenu = useCallback(() => { setMenuOpen(false); menuButton.current?.focus(); }, []);

  return (
    <div className="flex min-h-screen">
      {/* desktop (>= 1024 px): sidebar selalu tampil */}
      <aside className="hidden w-64 shrink-0 bg-[#10302C] text-white/90 lg:block">
        <div className="sticky top-0 h-screen">
          <SidebarContent groups={groups} user={user} logout={logout} />
        </div>
      </aside>

      {/* HP & tablet (< 1024 px): sidebar jadi panel geser dari kiri */}
      {menuOpen && <MobileMenu onClose={closeMenu}><SidebarContent groups={groups} user={user} logout={logout} /></MobileMenu>}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-line bg-white px-3 py-2.5 sm:px-4 lg:static lg:px-8 lg:py-3">
          <div className="flex min-w-0 items-center gap-2">
            <button ref={menuButton} onClick={() => setMenuOpen(true)} aria-label="Buka menu" aria-expanded={menuOpen} aria-controls="menu-hp"
              className="-ml-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-md text-ink hover:bg-wall lg:hidden">
              <Menu className="h-6 w-6" aria-hidden />
            </button>
            <img src="/favicon.svg" alt="" className="h-7 w-7 shrink-0 lg:hidden" />
            <p className="truncate font-extrabold lg:hidden">SIMRS Rawat Jalan</p>
            <p className="hidden text-[0.9rem] text-ink-soft lg:block">{tanggalPanjang(today())}</p>
          </div>
          <p className="hidden shrink-0 text-[0.9rem] text-ink-soft sm:block">Masuk sebagai <span className="font-semibold text-ink">{user.username}</span></p>
        </header>
        <main className="mx-auto w-full max-w-[1400px] flex-1 px-3 py-5 sm:px-4 sm:py-6 lg:px-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

/** Isi sidebar: logo, menu per unit, user aktif, tombol keluar. Dipakai sidebar desktop dan menu HP. */
function SidebarContent({ groups, user, logout }) {
  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <div className="flex items-center gap-3 px-5 py-5">
        <img src="/favicon.svg" alt="" className="h-8 w-8" />
        <div>
          <p className="font-extrabold leading-tight text-white">SIMRS Rawat Jalan</p>
          <p className="text-[0.78rem] text-white/60">RS Inova Medika (demo)</p>
        </div>
      </div>
      <nav className="flex-1 px-3 pb-4" aria-label="Menu utama">
        {groups.map((g) => (
          <div key={g.unit} className="mt-4">
            <p className="flex items-center gap-2 px-2 pb-1.5 text-[0.78rem] font-semibold text-white/55">
              <span className={`h-2.5 w-2.5 rounded-sm ${g.color}`} aria-hidden />{g.unit}
            </p>
            {g.items.map((i) => (
              <NavLink key={i.to} to={i.to} end={i.to === '/farmasi'}
                className={({ isActive }) => `flex items-center gap-3 rounded-md px-2 py-2.5 text-[0.92rem] lg:py-2 ${isActive ? 'bg-white/10 font-semibold text-white' : 'text-white/75 hover:bg-white/5 hover:text-white'}`}>
                {({ isActive }) => (<>
                  <span className={`h-5 w-1 rounded-full ${isActive ? g.color : 'bg-transparent'}`} aria-hidden />
                  <i.icon className="h-4 w-4" aria-hidden />{i.label}
                </>)}
              </NavLink>
            ))}
          </div>
        ))}
      </nav>
      <div className="border-t border-white/10 px-5 py-4">
        <p className="font-semibold text-white">{user.full_name}</p>
        <p className="text-[0.82rem] text-white/60">{user.role_name}</p>
        <button onClick={logout} className="mt-3 inline-flex items-center gap-2 text-[0.88rem] text-white/75 hover:text-white">
          <LogOut className="h-4 w-4" /> Keluar
        </button>
      </div>
      <p className="px-5 pb-4 text-[0.75rem] leading-snug text-white/40">Dibuat oleh<br />Mochamad Mutaqin Kurniawan</p>
    </div>
  );
}

/** Panel menu geser untuk layar < 1024 px. Tutup dengan tombol X, klik di luar panel, atau Escape. */
function MobileMenu({ onClose, children }) {
  const closeBtn = useRef(null);
  useEffect(() => {
    closeBtn.current?.focus();
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';            // halaman di belakang tidak ikut tergulir
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = prevOverflow; };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 lg:hidden" id="menu-hp" role="dialog" aria-modal="true" aria-label="Menu">
      <button className="absolute inset-0 h-full w-full cursor-default bg-ink/50" onClick={onClose} aria-label="Tutup menu" tabIndex={-1} />
      <div className="relative h-full w-72 max-w-[85vw] bg-[#10302C] text-white/90 shadow-xl">
        <button ref={closeBtn} onClick={onClose} aria-label="Tutup menu"
          className="absolute right-2 top-3 z-10 flex h-10 w-10 items-center justify-center rounded-md text-white/75 hover:bg-white/10 hover:text-white">
          <X className="h-5 w-5" aria-hidden />
        </button>
        {children}
      </div>
    </div>
  );
}

/** Judul halaman dengan garis warna unit di kiri (penunjuk arah). */
export function PageHeader({ unit = 'admin', title, subtitle, actions }) {
  const bar = { reg: 'bg-unit-reg', exam: 'bg-unit-exam', pharm: 'bg-unit-pharm', lab: 'bg-unit-lab', cash: 'bg-unit-cash', admin: 'bg-unit-admin', dash: 'bg-unit-dash' }[unit];
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="flex gap-3">
        <span className={`w-1.5 rounded-full ${bar}`} aria-hidden />
        <div>
          <h1 className="text-[1.65rem] font-extrabold leading-tight">{title}</h1>
          {subtitle && <p className="mt-0.5 text-ink-soft">{subtitle}</p>}
        </div>
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

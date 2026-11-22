/**
 * SIMRS Rawat Jalan
 *
 * @author  Mochamad Mutaqin Kurniawan <mochmutaqin@gmail.com>
 * @link    https://github.com/mochmutaqin/simrs-rawat-jalan
 */

import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './auth/AuthContext';
import Layout, { firstAllowedPath } from './components/Layout';
import { Empty, Spinner } from './components/ui';
import { InvoiceDetail, InvoiceList } from './pages/Billing';
import DoctorQueue from './pages/DoctorQueue';
import Examination from './pages/Examination';
import Lab from './pages/Lab';
import Login from './pages/Login';
import MasterData from './pages/MasterData';
import { PatientDetail, PatientList } from './pages/Patients';
import { MedicineStock, PrescriptionQueue } from './pages/Pharmacy';
import Registration from './pages/Registration';

// grafik (recharts) hanya dimuat saat dashboard dibuka
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Reports = lazy(() => import('./pages/Reports'));

/** Route dilindungi permission yang sama dengan backend (lapisan UX; keamanan tetap di API). */
function Guard({ perms, children }) {
  const { can } = useAuth();
  return can(...perms) ? children : <Empty title="Anda tidak punya akses ke halaman ini">Hubungi administrator bila Anda membutuhkannya.</Empty>;
}

export default function App() {
  const { user, loading, can } = useAuth();
  if (loading) return <div className="flex min-h-screen items-center justify-center"><Spinner /></div>;
  if (!user) return <Routes><Route path="*" element={<Login />} /></Routes>;

  return (
    <Routes>
      <Route path="/login" element={<Navigate to="/" replace />} />
      <Route element={<Layout />}>
        <Route index element={<Navigate to={firstAllowedPath(can)} replace />} />
        <Route path="dashboard" element={<Guard perms={['report.view']}><Suspense fallback={<Spinner />}><Dashboard /></Suspense></Guard>} />
        <Route path="laporan" element={<Guard perms={['report.view', 'medicine.manage']}><Suspense fallback={<Spinner />}><Reports /></Suspense></Guard>} />
        <Route path="pendaftaran" element={<Guard perms={['registration.manage', 'queue.view']}><Registration /></Guard>} />
        <Route path="pasien" element={<Guard perms={['patient.manage', 'exam.view', 'billing.view']}><PatientList /></Guard>} />
        <Route path="pasien/:id" element={<Guard perms={['patient.manage', 'exam.view', 'billing.view', 'queue.view']}><PatientDetail /></Guard>} />
        <Route path="pemeriksaan" element={<Guard perms={['exam.view']}><DoctorQueue /></Guard>} />
        <Route path="pemeriksaan/:visitId" element={<Guard perms={['exam.view']}><Examination /></Guard>} />
        <Route path="farmasi" element={<Guard perms={['pharmacy.process', 'prescription.view']}><PrescriptionQueue /></Guard>} />
        <Route path="farmasi/stok" element={<Guard perms={['medicine.manage']}><MedicineStock /></Guard>} />
        <Route path="lab" element={<Guard perms={['lab.view']}><Lab /></Guard>} />
        <Route path="kasir" element={<Guard perms={['billing.view']}><InvoiceList /></Guard>} />
        <Route path="kasir/:id" element={<Guard perms={['billing.view']}><InvoiceDetail /></Guard>} />
        <Route path="master/:resource" element={<Guard perms={['master.manage', 'user.manage']}><MasterData /></Guard>} />
        <Route path="*" element={<Empty title="Halaman tidak ditemukan" />} />
      </Route>
    </Routes>
  );
}

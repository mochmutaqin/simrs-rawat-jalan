/**
 * SIMRS Rawat Jalan
 *
 * @author  Mochamad Mutaqin Kurniawan <mochmutaqin@gmail.com>
 * @link    https://github.com/mochmutaqin/simrs-rawat-jalan
 */

import { useState } from 'react';
import { yii } from '../api/client';
import { Button, ErrorBox, Input, Select, Textarea } from './ui';
import { tanggal } from '../lib/format';

const EMPTY = { nik: '', name: '', birth_date: '', gender: '', address: '', phone: '' };

/**
 * Form tambah/ubah pasien. Menangani 409 POSSIBLE_DUPLICATE dari backend:
 * tampilkan kandidat pasien serupa dan minta konfirmasi sebelum benar-benar membuat data baru.
 */
export default function PatientForm({ initial, onSaved, onCancel, onPickExisting }) {
  const [form, setForm] = useState({ ...EMPTY, ...(initial || {}) });
  const [errors, setErrors] = useState({});
  const [error, setError] = useState(null);
  const [dupes, setDupes] = useState(null);
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const save = async (confirmNew = false) => {
    setBusy(true); setError(null); setErrors({});
    const body = { ...form, ...(confirmNew ? { confirm_new: true } : {}) };
    try {
      const res = initial?.id ? await yii.put(`/patients/${initial.id}`, body) : await yii.post('/patients', body);
      onSaved(res.data);
    } catch (e) {
      if (e.code === 'POSSIBLE_DUPLICATE') setDupes(e.details);
      else { setErrors(e.fieldErrors()); setError(e); }
    } finally { setBusy(false); }
  };

  if (dupes) {
    return (
      <div className="space-y-4">
        <div className="rounded-md border border-st-wait/40 bg-st-wait/5 px-4 py-3 text-[0.92rem]">
          <p className="font-semibold text-st-wait">Ada pasien dengan nama dan tanggal lahir yang sama.</p>
          <p className="mt-1 text-ink-soft">Pastikan bukan orang yang sama sebelum membuat rekam medis baru.</p>
        </div>
        <ul className="divide-y divide-line rounded-md border border-line">
          {dupes.map((p) => (
            <li key={p.id} className="flex items-center justify-between gap-3 px-3 py-2.5">
              <div>
                <p className="font-semibold">{p.name} <span className="num font-normal text-ink-soft">· {p.medical_record_no}</span></p>
                <p className="text-[0.85rem] text-ink-soft">Lahir {tanggal(p.birth_date)} · NIK {p.nik || 'tidak ada'} · {p.address || 'alamat kosong'}</p>
              </div>
              {onPickExisting && <Button size="sm" variant="secondary" onClick={() => onPickExisting(p)}>Pakai pasien ini</Button>}
            </li>
          ))}
        </ul>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setDupes(null)}>Kembali ke form</Button>
          <Button busy={busy} onClick={() => save(true)}>Tetap buat pasien baru</Button>
        </div>
      </div>
    );
  }

  return (
    <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); save(); }}>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Input label="Nama lengkap" value={form.name} onChange={set('name')} error={errors.name} required className="sm:col-span-2" />
        <Input label="NIK" inputMode="numeric" maxLength={16} value={form.nik || ''} onChange={set('nik')} error={errors.nik} hint="16 digit, kosongkan bila tidak ada" />
        <Input label="Nomor HP" value={form.phone || ''} onChange={set('phone')} error={errors.phone} />
        <Input label="Tanggal lahir" type="date" value={form.birth_date} onChange={set('birth_date')} error={errors.birth_date} required />
        <Select label="Jenis kelamin" value={form.gender} onChange={set('gender')} error={errors.gender} required>
          <option value="">Pilih</option><option value="L">Laki-laki</option><option value="P">Perempuan</option>
        </Select>
        <Textarea label="Alamat" rows={2} value={form.address || ''} onChange={set('address')} error={errors.address} className="sm:col-span-2" />
      </div>
      {error && !Object.keys(errors).length && <ErrorBox error={error} />}
      <div className="flex justify-end gap-2 pt-2">
        {onCancel && <Button variant="secondary" onClick={onCancel}>Batal</Button>}
        <Button type="submit" busy={busy}>{initial?.id ? 'Simpan perubahan' : 'Simpan pasien'}</Button>
      </div>
    </form>
  );
}

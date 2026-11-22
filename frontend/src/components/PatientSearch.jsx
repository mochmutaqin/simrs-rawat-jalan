/**
 * SIMRS Rawat Jalan
 *
 * @author  Mochamad Mutaqin Kurniawan <mochmutaqin@gmail.com>
 * @link    https://github.com/mochmutaqin/simrs-rawat-jalan
 */

import { useEffect, useState } from 'react';
import { Search } from 'lucide-react';
import { yii } from '../api/client';
import { umur, tanggal } from '../lib/format';

/** Cari pasien berdasarkan no. RM, NIK, atau nama (debounce 300 ms). */
export default function PatientSearch({ onPick, autoFocus }) {
  const [q, setQ] = useState('');
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (q.trim().length < 2) { setRows([]); return undefined; }
    setLoading(true);
    const t = setTimeout(() => {
      yii.get('/patients', { q: q.trim(), limit: 8 })
        .then(({ data }) => setRows(data))
        .catch(() => setRows([]))
        .finally(() => setLoading(false));
    }, 300);
    return () => clearTimeout(t);
  }, [q]);

  return (
    <div>
      <label className="relative block">
        <span className="sr-only">Cari pasien</span>
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" />
        <input autoFocus={autoFocus} className="field-input pl-9" placeholder="No. RM, NIK, atau nama pasien" value={q} onChange={(e) => setQ(e.target.value)} />
      </label>
      {q.trim().length >= 2 && (
        <ul className="mt-2 max-h-72 divide-y divide-line overflow-y-auto rounded-md border border-line">
          {loading && <li className="px-3 py-2.5 text-ink-soft">Mencari…</li>}
          {!loading && rows.length === 0 && <li className="px-3 py-2.5 text-ink-soft">Tidak ada pasien yang cocok. Daftarkan sebagai pasien baru.</li>}
          {!loading && rows.map((p) => (
            <li key={p.id}>
              <button type="button" onClick={() => onPick(p)} className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left hover:bg-rs-tint">
                <span>
                  <span className="block font-semibold">{p.name}</span>
                  <span className="text-[0.85rem] text-ink-soft">{p.gender === 'L' ? 'Laki-laki' : 'Perempuan'}, {umur(p.birth_date)} · lahir {tanggal(p.birth_date)}</span>
                </span>
                <span className="num text-right text-[0.85rem]"><span className="block font-semibold">{p.medical_record_no}</span><span className="text-ink-faint">{p.nik || 'tanpa NIK'}</span></span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

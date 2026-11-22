/**
 * SIMRS Rawat Jalan
 *
 * @author  Mochamad Mutaqin Kurniawan <mochmutaqin@gmail.com>
 * @link    https://github.com/mochmutaqin/simrs-rawat-jalan
 */

import { useState } from 'react';
import { Input } from './ui';
import { shiftDate, today } from '../lib/format';

export const PRESETS = [
  { key: 'today', label: 'Hari ini', range: () => [today(), today()] },
  { key: '7d', label: '7 hari', range: () => [shiftDate(today(), -6), today()] },
  { key: '30d', label: '30 hari', range: () => [shiftDate(today(), -29), today()] },
  { key: 'month', label: 'Bulan ini', range: () => [`${today().slice(0, 8)}01`, today()] },
];

/** State periode laporan: preset cepat atau tanggal bebas. */
export function usePeriod(initial = '30d') {
  const [preset, setPreset] = useState(initial);
  const [[from, to], setRange] = useState(() => PRESETS.find((p) => p.key === initial).range());
  return {
    from, to, preset,
    pick: (p) => { setPreset(p.key); setRange(p.range()); },
    setFrom: (v) => { setPreset(''); setRange([v, to]); },
    setTo: (v) => { setPreset(''); setRange([from, v]); },
  };
}

/** Filter periode satu baris di atas laporan; filter tambahan (children) ikut di baris yang sama. */
export function PeriodFilter({ period, children }) {
  return (
    <div className="mb-6 flex flex-wrap items-end gap-3">
      <div className="flex w-full rounded-md border border-line-strong bg-white p-0.5 sm:w-auto" role="group" aria-label="Periode cepat">
        {PRESETS.map((p) => (
          <button key={p.key} onClick={() => period.pick(p)} aria-pressed={period.preset === p.key}
            className={`flex-1 whitespace-nowrap rounded px-2.5 py-1.5 text-[0.9rem] font-semibold sm:flex-none sm:px-3 ${period.preset === p.key ? 'bg-rs text-white' : 'text-ink-soft hover:bg-wall'}`}>{p.label}</button>
        ))}
      </div>
      <Input label="Dari" type="date" value={period.from} max={period.to} onChange={(e) => e.target.value && period.setFrom(e.target.value)} className="w-[calc(50%-0.375rem)] sm:w-44" />
      <Input label="Sampai" type="date" value={period.to} min={period.from} onChange={(e) => e.target.value && period.setTo(e.target.value)} className="w-[calc(50%-0.375rem)] sm:w-44" />
      {children}
    </div>
  );
}

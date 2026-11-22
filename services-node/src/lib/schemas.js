'use strict';
const { z } = require('zod');

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'format harus YYYY-MM-DD')
  .refine((s) => !Number.isNaN(Date.parse(s)), 'tanggal tidak valid');

// Tanggal lokal server (set TZ=Asia/Jakarta), bukan UTC, agar "hari ini" sesuai jam RS.
const isoDate = (d) => {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

// Filter periode: default 30 hari terakhir, maksimal 366 hari.
// withPeriod(extra) -> skema query yang berisi from/to + field tambahan.
const withPeriod = (extra = {}) => z.object({ from: day.optional(), to: day.optional(), ...extra })
  .transform((q) => {
    const to = q.to || isoDate(new Date());
    const from = q.from || isoDate(new Date(new Date(`${to}T00:00:00`).getTime() - 29 * 86400000));
    return { ...q, from, to };
  })
  .refine((q) => q.from <= q.to, { message: 'from tidak boleh setelah to', path: ['from'] })
  .refine((q) => (Date.parse(q.to) - Date.parse(q.from)) / 86400000 <= 366,
    { message: 'rentang maksimal 366 hari', path: ['to'] });

const period = withPeriod();

const paging = {
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
};

const id = z.object({ id: z.coerce.number().int().positive() });

module.exports = { z, day, period, withPeriod, paging, id };

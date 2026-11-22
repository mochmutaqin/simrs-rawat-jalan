import { createContext, useCallback, useContext, useEffect, useId, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, Loader2, X } from 'lucide-react';

/* ---------- tombol ---------- */
const BTN = {
  primary: 'bg-rs text-white hover:bg-rs-dark disabled:bg-rs/50',
  secondary: 'bg-white text-ink border border-line-strong hover:bg-wall disabled:text-ink-faint',
  danger: 'bg-white text-st-danger border border-st-danger/40 hover:bg-st-danger/5 disabled:opacity-50',
  ghost: 'text-ink-soft hover:bg-wall hover:text-ink',
};
export function Button({ variant = 'primary', size = 'md', busy, icon: Icon, children, className = '', ...props }) {
  const pad = size === 'sm' ? 'px-2.5 py-1.5 text-[0.85rem]' : 'px-4 py-2';
  return (
    <button
      type="button"
      className={`inline-flex items-center justify-center gap-2 rounded-md font-semibold transition-colors disabled:cursor-not-allowed ${pad} ${BTN[variant]} ${className}`}
      disabled={busy || props.disabled}
      {...props}
    >
      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : Icon && <Icon className="h-4 w-4" aria-hidden />}
      {children}
    </button>
  );
}

/* ---------- form ---------- */
export function Field({ label, error, hint, children, className = '' }) {
  const id = useId();
  return (
    <div className={className}>
      {label && <label htmlFor={id} className="mb-1 block text-[0.85rem] font-semibold text-ink-soft">{label}</label>}
      {typeof children === 'function' ? children(id) : children}
      {error ? <p className="mt-1 text-[0.82rem] text-st-danger">{error}</p> : hint && <p className="mt-1 text-[0.82rem] text-ink-faint">{hint}</p>}
    </div>
  );
}
export const Input = ({ label, error, hint, className, ...p }) => (
  <Field label={label} error={error} hint={hint} className={className}>
    {(id) => <input id={id} className={`field-input ${error ? 'border-st-danger' : ''}`} {...p} />}
  </Field>
);
export const Textarea = ({ label, error, hint, className, rows = 3, ...p }) => (
  <Field label={label} error={error} hint={hint} className={className}>
    {(id) => <textarea id={id} rows={rows} className={`field-input ${error ? 'border-st-danger' : ''}`} {...p} />}
  </Field>
);
export const Select = ({ label, error, hint, className, children, ...p }) => (
  <Field label={label} error={error} hint={hint} className={className}>
    {(id) => <select id={id} className={`field-input ${error ? 'border-st-danger' : ''}`} {...p}>{children}</select>}
  </Field>
);

/* ---------- status ---------- */
const TONE = {
  wait: 'bg-st-wait/10 text-st-wait', exam: 'bg-st-exam/10 text-st-exam', done: 'bg-st-done/10 text-st-done',
  cancel: 'bg-st-cancel/15 text-ink-soft', danger: 'bg-st-danger/10 text-st-danger', neutral: 'bg-wall text-ink-soft',
};
export const Badge = ({ tone = 'neutral', children }) => (
  <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-[0.8rem] font-semibold ${TONE[tone]}`}>
    <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden />{children}
  </span>
);
export const StatusBadge = ({ map, value }) => {
  const s = map[value] || { label: value, tone: 'neutral' };
  return <Badge tone={s.tone}>{s.label}</Badge>;
};

/** Nomor antrean bergaya tiket: elemen paling khas di aplikasi ini. */
export function QueueTicket({ code, size = 'md', tone = 'exam' }) {
  const [poli, no] = String(code || '').split('-');
  const big = size === 'lg';
  const color = { wait: 'border-st-wait text-st-wait', exam: 'border-unit-exam text-unit-exam', done: 'border-st-done text-st-done', cancel: 'border-line-strong text-ink-faint' }[tone];
  return (
    <span className={`num inline-flex flex-col items-center justify-center rounded-md border-2 border-dashed bg-white leading-none ${color} ${big ? 'min-w-[7rem] px-4 py-3' : 'min-w-[4.5rem] px-2 py-1.5'}`}>
      <span className={`font-semibold tracking-wide ${big ? 'text-sm' : 'text-[0.65rem]'}`}>{poli}</span>
      <span className={`font-extrabold ${big ? 'mt-1 text-4xl' : 'text-xl'}`}>{no}</span>
    </span>
  );
}

/* ---------- umpan balik ---------- */
export const Spinner = ({ label = 'Memuat…' }) => (
  <div className="flex items-center gap-2 py-8 text-ink-soft"><Loader2 className="h-5 w-5 animate-spin" />{label}</div>
);
export function ErrorBox({ error, onRetry }) {
  if (!error) return null;
  return (
    <div role="alert" className="flex items-start gap-3 rounded-md border border-st-danger/30 bg-st-danger/5 px-4 py-3 text-[0.92rem] text-st-danger">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
      <div className="flex-1">
        <p className="font-semibold">{error.message}</p>
        {Array.isArray(error.details) && error.details.length > 0 && !error.details[0]?.field?.startsWith?.('__') && (
          <ul className="mt-1 list-disc pl-5 text-[0.85rem]">
            {error.details.filter((d) => d.message).map((d, i) => <li key={i}>{d.field ? `${d.field}: ` : ''}{d.message}</li>)}
          </ul>
        )}
      </div>
      {onRetry && <button className="font-semibold underline" onClick={onRetry}>Coba lagi</button>}
    </div>
  );
}
export const Empty = ({ title, children, action }) => (
  <div className="flex flex-col items-center px-6 py-12 text-center">
    <p className="font-semibold text-ink">{title}</p>
    {children && <p className="mt-1 max-w-md text-[0.9rem] text-ink-soft">{children}</p>}
    {action && <div className="mt-4">{action}</div>}
  </div>
);

/* ---------- modal ---------- */
export function Modal({ open, title, onClose, children, footer, width = 'max-w-lg' }) {
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => e.key === 'Escape' && onClose?.();
    window.addEventListener('keydown', onKey);
    ref.current?.querySelector('input,select,textarea,button')?.focus();
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink/40 p-4 pt-[8vh]" onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}>
      <div ref={ref} role="dialog" aria-modal="true" aria-label={title} className={`w-full ${width} rounded-panel bg-white shadow-xl`}>
        <div className="flex items-center justify-between border-b border-line px-5 py-3.5">
          <h2 className="text-lg font-bold">{title}</h2>
          <button className="rounded p-1 text-ink-soft hover:bg-wall" onClick={onClose} aria-label="Tutup"><X className="h-5 w-5" /></button>
        </div>
        <div className="px-5 py-4">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-line bg-wall/60 px-5 py-3">{footer}</div>}
      </div>
    </div>
  );
}

/* ---------- toast ---------- */
const ToastCtx = createContext(() => {});
export function ToastProvider({ children }) {
  const [items, setItems] = useState([]);
  const push = useCallback((message, tone = 'success') => {
    const id = Math.random();
    setItems((x) => [...x, { id, message, tone }]);
    setTimeout(() => setItems((x) => x.filter((i) => i.id !== id)), 4000);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-[60] flex flex-col gap-2" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} className={`pointer-events-auto flex items-center gap-2 rounded-md px-4 py-3 text-[0.92rem] font-semibold text-white shadow-lg ${t.tone === 'error' ? 'bg-st-danger' : 'bg-ink'}`}>
            {t.tone === 'error' ? <AlertTriangle className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}{t.message}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}
export const useToast = () => useContext(ToastCtx);

/* ---------- tabel & paginasi ---------- */
export function Pagination({ meta, onPage }) {
  if (!meta || meta.total_pages <= 1) return null;
  return (
    <div className="flex items-center justify-between border-t border-line px-3 py-2 text-[0.85rem] text-ink-soft">
      <span className="num">{meta.total} data · halaman {meta.page} dari {meta.total_pages}</span>
      <div className="flex gap-1">
        <Button size="sm" variant="secondary" disabled={meta.page <= 1} onClick={() => onPage(meta.page - 1)}>Sebelumnya</Button>
        <Button size="sm" variant="secondary" disabled={meta.page >= meta.total_pages} onClick={() => onPage(meta.page + 1)}>Berikutnya</Button>
      </div>
    </div>
  );
}

export function Tabs({ tabs, value, onChange }) {
  return (
    <div role="tablist" className="flex gap-1 border-b border-line">
      {tabs.map((t) => (
        <button key={t.value} role="tab" aria-selected={value === t.value} onClick={() => onChange(t.value)}
          className={`-mb-px border-b-2 px-3 py-2 text-[0.92rem] font-semibold ${value === t.value ? 'border-rs text-ink' : 'border-transparent text-ink-soft hover:text-ink'}`}>
          {t.label}{t.count !== undefined && <span className="num ml-1.5 text-ink-faint">{t.count}</span>}
        </button>
      ))}
    </div>
  );
}

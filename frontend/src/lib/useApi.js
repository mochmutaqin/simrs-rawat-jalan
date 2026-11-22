import { useCallback, useEffect, useRef, useState } from 'react';

/** Ambil data saat dependensi berubah. reload() untuk memuat ulang setelah aksi. */
export function useApi(fetcher, deps = []) {
  const [state, setState] = useState({ data: null, meta: null, error: null, loading: true });
  const seq = useRef(0);

  const load = useCallback(async () => {
    const id = ++seq.current;
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const res = await fetcher();
      if (id === seq.current) setState({ data: res?.data ?? null, meta: res?.meta ?? null, error: null, loading: false });
    } catch (error) {
      if (id === seq.current) setState((s) => ({ ...s, error, loading: false }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => { load(); }, [load]);
  return { ...state, reload: load };
}

/** Jalankan aksi (POST/PUT/DELETE) dengan status busy + error. */
export function useAction() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const run = useCallback(async (fn) => {
    setBusy(true); setError(null);
    try { return await fn(); }
    catch (e) { setError(e); throw e; }
    finally { setBusy(false); }
  }, []);
  return { busy, error, setError, run };
}

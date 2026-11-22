/**
 * Klien HTTP untuk dua backend:
 *   yii  -> /api/...           (business logic & semua penulisan data)
 *   node -> /node/api/v1/...   (lab worklist/hasil, dashboard)
 * Kedua backend memakai format yang sama:
 *   sukses { success: true, data, meta }  |  gagal { success: false, error: { code, message, details } }
 */
const TOKEN_KEY = 'simrs.token';

export class ApiError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }

  /** details [{field, message}] -> { field: message } untuk ditampilkan di form */
  fieldErrors() {
    const out = {};
    if (Array.isArray(this.details)) {
      for (const d of this.details) if (d.field && !out[d.field]) out[d.field] = d.message;
    }
    return out;
  }
}

export const tokenStore = {
  get: () => { try { return localStorage.getItem(TOKEN_KEY); } catch { return null; } },
  set: (t) => { try { localStorage.setItem(TOKEN_KEY, t); } catch { /* storage diblokir */ } },
  clear: () => { try { localStorage.removeItem(TOKEN_KEY); } catch { /* storage diblokir */ } },
};

let onUnauthorized = () => {};
export const setUnauthorizedHandler = (fn) => { onUnauthorized = fn; };

async function request(base, method, path, { body, query, headers, raw } = {}) {
  const url = new URL(base + path, window.location.origin);
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, v);
    }
  }
  const token = tokenStore.get();
  let res;
  try {
    res = await fetch(url, {
      method,
      headers: {
        Accept: raw ? '*/*' : 'application/json',
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...headers,
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(0, 'NETWORK_ERROR', 'Server tidak dapat dihubungi. Periksa koneksi atau pastikan backend menyala.');
  }

  if (raw && res.ok) return res.text();
  let json = null;
  try { json = await res.json(); } catch { /* bukan JSON */ }

  if (!res.ok || json?.success === false) {
    const e = json?.error || {};
    if (res.status === 401 && path !== '/auth/login') onUnauthorized();
    throw new ApiError(res.status, e.code || `HTTP_${res.status}`, e.message || `Permintaan gagal (${res.status})`, e.details);
  }
  return { data: json?.data, meta: json?.meta };
}

const client = (base) => ({
  get: (path, query, opts) => request(base, 'GET', path, { query, ...opts }),
  post: (path, body, opts) => request(base, 'POST', path, { body: body ?? {}, ...opts }),
  put: (path, body, opts) => request(base, 'PUT', path, { body: body ?? {}, ...opts }),
  del: (path, body, opts) => request(base, 'DELETE', path, { body, ...opts }),
  html: (path) => request(base, 'GET', path, { raw: true }),
});

export const yii = client('/api');
export const node = client('/node/api/v1');

/** Kunci idempotensi: dibuat SEKALI saat form transaksi dibuka, dipakai ulang saat retry. */
export const newIdempotencyKey = (prefix = 'key') =>
  `${prefix}-${(crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`)}`;

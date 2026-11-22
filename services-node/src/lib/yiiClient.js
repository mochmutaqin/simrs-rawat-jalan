'use strict';
const config = require('../config');
const { AppError, unavailable } = require('./errors');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Panggil endpoint internal Yii. Retry hanya untuk kegagalan jaringan/timeout/5xx
// dengan exponential backoff. 4xx diteruskan apa adanya (bukan salah jaringan).
// Aman diulang karena endpoint Yii menerima Idempotency-Key (lihat docs).
async function callYii(method, path, { body, idempotencyKey } = {}) {
  const { baseUrl, serviceToken, timeoutMs, retries, retryBaseMs } = config.yii;
  let lastErr;

  for (let attempt = 0; attempt <= retries; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(baseUrl + path, {
        method,
        signal: ctrl.signal,
        headers: {
          'Content-Type': 'application/json',
          'X-Service-Token': serviceToken,
          ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
      });
      const text = await res.text();
      let json; try { json = text ? JSON.parse(text) : null; } catch { json = null; }

      if (res.status >= 500) throw new Error(`Yii ${res.status}`);
      if (res.status >= 400) {
        const e = json?.error || {};
        throw new AppError(res.status, e.code || 'UPSTREAM_REJECTED', e.message || 'Ditolak oleh SIMRS', e.details);
      }
      return json;
    } catch (err) {
      if (err instanceof AppError) throw err;          // 4xx: jangan retry
      lastErr = err;
      if (attempt < retries) await sleep(retryBaseMs * 2 ** attempt);
    } finally {
      clearTimeout(timer);
    }
  }
  throw unavailable('Layanan SIMRS (Yii) tidak dapat dihubungi, data belum tersimpan. Coba lagi.', {
    attempts: retries + 1,
    reason: lastErr?.name === 'AbortError' ? 'timeout' : lastErr?.message,
  });
}

module.exports = { callYii };

'use strict';
// Error aplikasi dengan status HTTP + kode mesin-readable.
class AppError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}
const badRequest   = (m, d) => new AppError(400, 'BAD_REQUEST', m, d);
const unauthorized = (m = 'Token tidak valid atau tidak ada') => new AppError(401, 'UNAUTHORIZED', m);
const forbidden    = (m = 'Tidak memiliki hak akses') => new AppError(403, 'FORBIDDEN', m);
const notFound     = (m = 'Data tidak ditemukan') => new AppError(404, 'NOT_FOUND', m);
const unavailable  = (m, d) => new AppError(503, 'UPSTREAM_UNAVAILABLE', m, d);

module.exports = { AppError, badRequest, unauthorized, forbidden, notFound, unavailable };

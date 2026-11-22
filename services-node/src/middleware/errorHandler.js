'use strict';
const { AppError } = require('../lib/errors');
const { fail } = require('../lib/response');

const notFoundHandler = (req, res) =>
  fail(res, 404, 'NOT_FOUND', `Route ${req.method} ${req.path} tidak ada`);

// eslint-disable-next-line no-unused-vars
function errorHandler(err, _req, res, _next) {
  if (err instanceof AppError) return fail(res, err.status, err.code, err.message, err.details);
  if (err.type === 'entity.parse.failed') return fail(res, 400, 'BAD_REQUEST', 'JSON tidak valid');
  if (err.code === '57014') return fail(res, 503, 'QUERY_TIMEOUT', 'Query terlalu lama, coba persempit filter');
  console.error('[error]', err);
  return fail(res, 500, 'INTERNAL_ERROR', 'Terjadi kesalahan pada server');
}

module.exports = { notFoundHandler, errorHandler };

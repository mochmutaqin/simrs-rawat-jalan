'use strict';
const { badRequest } = require('../lib/errors');

// validate({ body, query, params }) memakai skema zod.
// Hasil parse (sudah di-coerce) ditaruh di req.valid.
const validate = (schemas) => (req, _res, next) => {
  req.valid = {};
  for (const part of ['params', 'query', 'body']) {
    if (!schemas[part]) continue;
    const r = schemas[part].safeParse(req[part]);
    if (!r.success) {
      const details = r.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message }));
      return next(badRequest('Validasi request gagal', details));
    }
    req.valid[part] = r.data;
  }
  next();
};

module.exports = { validate };

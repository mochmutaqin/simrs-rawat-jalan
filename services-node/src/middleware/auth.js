/**
 * SIMRS Rawat Jalan
 *
 * @author  Mochamad Mutaqin Kurniawan <mochmutaqin@gmail.com>
 * @link    https://github.com/mochmutaqin/simrs-rawat-jalan
 */

'use strict';
const jwt = require('jsonwebtoken');
const config = require('../config');
const { unauthorized, forbidden } = require('../lib/errors');

// Verifikasi JWT yang diterbitkan Yii (HS256, secret bersama).
function authenticate(req, _res, next) {
  const h = req.headers.authorization || '';
  const [scheme, token] = h.split(' ');
  if (scheme !== 'Bearer' || !token) return next(unauthorized());
  try {
    const p = jwt.verify(token, config.jwtSecret, { algorithms: ['HS256'] });
    req.user = { id: p.sub, username: p.username, role: p.role, perms: p.perms || [] };
    return next();
  } catch (e) {
    return next(unauthorized(e.name === 'TokenExpiredError' ? 'Token kedaluwarsa' : undefined));
  }
}

// Cek permission code (sama dengan seed di database/001_schema.sql).
// 'admin' punya semua permission di seed, sehingga cukup cek claim perms.
const requirePermission = (...codes) => (req, _res, next) => {
  const have = req.user?.perms || [];
  if (codes.some((c) => have.includes(c))) return next();
  return next(forbidden(`Butuh permission: ${codes.join(' / ')}`));
};

// Endpoint antar-service (event dari Yii) memakai token layanan, bukan JWT user.
function serviceAuth(req, _res, next) {
  if (req.headers['x-service-token'] === config.serviceToken) return next();
  return next(unauthorized('Service token tidak valid'));
}

module.exports = { authenticate, requirePermission, serviceAuth };

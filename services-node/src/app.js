/**
 * SIMRS Rawat Jalan
 *
 * @author  Mochamad Mutaqin Kurniawan <mochmutaqin@gmail.com>
 * @link    https://github.com/mochmutaqin/simrs-rawat-jalan
 */

'use strict';
const express = require('express');
const db = require('./db');
const { authenticate } = require('./middleware/auth');
const { cors } = require('./middleware/cors');
const { notFoundHandler, errorHandler } = require('./middleware/errorHandler');
const { ok } = require('./lib/response');

const app = express();
app.disable('x-powered-by');
app.use(cors);
app.use(express.json({ limit: '100kb' }));

app.get('/health', async (_req, res) => {
  let database = 'up';
  try { await db.query('SELECT 1'); } catch { database = 'down'; }
  res.status(database === 'up' ? 200 : 503).json({ success: database === 'up', data: { status: database === 'up' ? 'ok' : 'degraded', database } });
});

const v1 = express.Router();
v1.use('/integration', require('./routes/integration'));   // service token
v1.use(authenticate);                                      // sisanya: JWT user
v1.get('/me', (req, res) => ok(res, req.user));
v1.use('/lab', require('./routes/lab'));
v1.use('/dashboard', require('./routes/dashboard'));
v1.use('/reports', require('./routes/reports'));
app.use('/api/v1', v1);

app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;

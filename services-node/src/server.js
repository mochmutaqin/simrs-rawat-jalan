/**
 * SIMRS Rawat Jalan
 *
 * @author  Mochamad Mutaqin Kurniawan <mochmutaqin@gmail.com>
 * @link    https://github.com/mochmutaqin/simrs-rawat-jalan
 */

'use strict';
const app = require('./app');
const db = require('./db');
const config = require('./config');

// HOST=127.0.0.1 di server produksi: Node hanya bisa diakses lewat Nginx, tidak langsung dari internet
const server = app.listen(config.port, config.host, () => console.log(`[simrs-node] listening on ${config.host || '*'}:${config.port}`));
const stop = () => server.close(() => db.close().then(() => process.exit(0)));
process.on('SIGTERM', stop);
process.on('SIGINT', stop);

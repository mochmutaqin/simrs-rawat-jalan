<?php

/**
 * SIMRS Rawat Jalan
 *
 * @author  Mochamad Mutaqin Kurniawan <mochmutaqin@gmail.com>
 * @link    https://github.com/mochmutaqin/simrs-rawat-jalan
 */

declare(strict_types=1);

$db = require __DIR__ . '/db.php';
// Database khusus tes: tes mengosongkan data transaksi.
$db['dsn'] = sprintf(
    'pgsql:host=%s;port=%s;dbname=%s',
    env('DB_HOST', 'localhost'),
    env('DB_PORT', '5432'),
    env('TEST_DB_NAME', 'simrs_test'),
);
$db['enableSchemaCache'] = false;

return $db;

<?php

declare(strict_types=1);

/** Konfigurasi aplikasi untuk tes (database simrs_test). */
$web = require __DIR__ . '/web.php';
$web['id'] = 'simrs-tests';
$web['components']['db'] = require __DIR__ . '/test_db.php';
$web['components']['request']['scriptFile'] = dirname(__DIR__) . '/web/index-test.php';
$web['components']['request']['scriptUrl'] = '/index-test.php';
unset($web['components']['log']);
$web['bootstrap'] = [];

return $web;

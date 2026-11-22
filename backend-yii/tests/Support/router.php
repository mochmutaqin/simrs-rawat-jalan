<?php

// Router untuk PHP built-in server (dev & tes): file statis dilayani langsung, sisanya ke front controller.
// Contoh: php -S 127.0.0.1:8080 -t web tests/Support/router.php
$path = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
if ($path !== '/' && is_file($_SERVER['DOCUMENT_ROOT'] . $path)) {
    return false;
}
$entry = getenv('YII_ENTRY') ?: 'index.php';
$_SERVER['SCRIPT_NAME'] = '/' . $entry;
$_SERVER['SCRIPT_FILENAME'] = $_SERVER['DOCUMENT_ROOT'] . '/' . $entry;
require $_SERVER['SCRIPT_FILENAME'];

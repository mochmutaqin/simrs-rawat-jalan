<?php

/**
 * SIMRS Rawat Jalan
 *
 * @author  Mochamad Mutaqin Kurniawan <mochmutaqin@gmail.com>
 * @link    https://github.com/mochmutaqin/simrs-rawat-jalan
 */

declare(strict_types=1);

/**
 * Loader .env sederhana (tanpa dependency). Variabel yang sudah ada di environment
 * tidak ditimpa, sehingga konfigurasi server/docker tetap menang.
 */
$envFile = dirname(__DIR__) . '/.env';
if (is_file($envFile)) {
    foreach (file($envFile, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) as $line) {
        $line = trim($line);
        if ($line === '' || str_starts_with($line, '#') || !str_contains($line, '=')) {
            continue;
        }
        [$name, $value] = array_map('trim', explode('=', $line, 2));
        $value = preg_replace('/\s+#.*$/', '', $value);
        $value = trim($value, "\"'");
        if (getenv($name) === false) {
            putenv("$name=$value");
            $_ENV[$name] = $value;
        }
    }
}

if (!function_exists('env')) {
    function env(string $name, mixed $default = null): mixed
    {
        $value = getenv($name);
        return $value === false || $value === '' ? $default : $value;
    }
}

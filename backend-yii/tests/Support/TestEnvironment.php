<?php

/**
 * SIMRS Rawat Jalan
 *
 * @author  Mochamad Mutaqin Kurniawan <mochmutaqin@gmail.com>
 * @link    https://github.com/mochmutaqin/simrs-rawat-jalan
 */

declare(strict_types=1);

namespace app\tests\Support;

/**
 * Menyiapkan lingkungan integration test:
 *  1. database simrs_test dibuat bila belum ada, skema dipasang (php yii migrate),
 *     data dikosongkan lalu di-seed ulang (php yii seed/demo);
 *  2. PHP built-in server dijalankan dengan entry web/index-test.php.
 * Di Linux/macOS server memakai PHP_CLI_SERVER_WORKERS sehingga request benar-benar paralel
 * (dibutuhkan uji konkurensi). Di Windows server built-in hanya 1 worker: uji tetap lulus,
 * tetapi request diproses berurutan.
 */
final class TestEnvironment
{
    private static $server = null;
    public static string $baseUrl = '';

    public static function boot(): void
    {
        $root = dirname(__DIR__, 2);
        $dbName = (string) (getenv('TEST_DB_NAME') ?: 'simrs_test');
        self::createDatabaseIfMissing($dbName);

        $env = ['DB_NAME' => $dbName, 'YII_DEBUG' => 'true'];
        self::run([PHP_BINARY, "$root/yii", 'migrate', '--interactive=0'], $env);
        self::truncate();
        self::run([PHP_BINARY, "$root/yii", 'seed/demo'], $env);

        $port = (int) (getenv('TEST_SERVER_PORT') ?: 8089);
        self::$baseUrl = "http://127.0.0.1:$port";
        $serverEnv = array_merge(getenv(), ['PHP_CLI_SERVER_WORKERS' => '8', 'YII_ENTRY' => 'index-test.php', 'TEST_DB_NAME' => $dbName]);
        $log = $root . '/runtime/test-server.log';
        self::$server = proc_open(
            [PHP_BINARY, '-S', "127.0.0.1:$port", '-t', "$root/web", "$root/tests/Support/router.php"],
            [0 => ['pipe', 'r'], 1 => ['file', $log, 'a'], 2 => ['file', $log, 'a']],
            $pipes, $root, $serverEnv,
        );
        register_shutdown_function([self::class, 'shutdown']);

        for ($i = 0; $i < 50; $i++) {
            if (@file_get_contents(self::$baseUrl . '/api/health') !== false) {
                return;
            }
            usleep(100_000);
        }
        throw new \RuntimeException('Server tes tidak bisa dijalankan, lihat ' . $log);
    }

    public static function shutdown(): void
    {
        if (is_resource(self::$server)) {
            $status = proc_get_status(self::$server);
            if (PHP_OS_FAMILY === 'Windows') {
                exec('taskkill /F /T /PID ' . $status['pid'] . ' >NUL 2>&1');
            } else {
                exec('pkill -P ' . (int) $status['pid'] . ' 2>/dev/null');
                proc_terminate(self::$server);
            }
            proc_close(self::$server);
            self::$server = null;
        }
    }

    public static function pdo(): \PDO
    {
        static $pdo = null;
        return $pdo ??= self::connect((string) (getenv('TEST_DB_NAME') ?: 'simrs_test'));
    }

    private static function connect(string $db): \PDO
    {
        $dsn = sprintf('pgsql:host=%s;port=%s;dbname=%s', getenv('DB_HOST') ?: 'localhost', getenv('DB_PORT') ?: '5432', $db);
        $pdo = new \PDO($dsn, getenv('DB_USER') ?: 'postgres', getenv('DB_PASSWORD') ?: 'postgres', [\PDO::ATTR_ERRMODE => \PDO::ERRMODE_EXCEPTION]);
        $pdo->exec("SET TIME ZONE '" . (getenv('APP_TIMEZONE') ?: 'Asia/Jakarta') . "'");
        return $pdo;
    }

    private static function createDatabaseIfMissing(string $db): void
    {
        if (!preg_match('/^[a-z0-9_]+$/', $db) || !str_contains($db, 'test')) {
            throw new \RuntimeException("Nama database tes harus mengandung 'test': $db");
        }
        $admin = self::connect('postgres');
        $exists = $admin->query("SELECT 1 FROM pg_database WHERE datname = " . $admin->quote($db))->fetchColumn();
        if (!$exists) {
            $admin->exec("CREATE DATABASE \"$db\"");
        }
    }

    private static function truncate(): void
    {
        $pdo = self::pdo();
        $tables = $pdo->query("SELECT string_agg(quote_ident(tablename), ', ') FROM pg_tables
            WHERE schemaname = 'public' AND tablename NOT IN ('roles', 'permissions', 'role_permissions', 'migration')")->fetchColumn();
        $pdo->exec("TRUNCATE $tables RESTART IDENTITY CASCADE");
        foreach (['seq_medical_record_no', 'seq_invoice_no', 'seq_receipt_no'] as $seq) {
            $pdo->exec("ALTER SEQUENCE $seq RESTART WITH 1");
        }
    }

    private static function run(array $cmd, array $env): void
    {
        $proc = proc_open($cmd, [1 => ['pipe', 'w'], 2 => ['pipe', 'w']], $pipes, dirname(__DIR__, 2), array_merge(getenv(), $env));
        $out = stream_get_contents($pipes[1]) . stream_get_contents($pipes[2]);
        if (proc_close($proc) !== 0) {
            throw new \RuntimeException('Gagal menjalankan ' . implode(' ', $cmd) . ":\n" . $out);
        }
    }
}

<?php

declare(strict_types=1);

require_once __DIR__ . '/env.php';

return [
    'class' => \yii\db\Connection::class,
    'dsn' => sprintf(
        'pgsql:host=%s;port=%s;dbname=%s',
        env('DB_HOST', 'localhost'),
        env('DB_PORT', '5432'),
        env('DB_NAME', 'simrs'),
    ),
    'username' => env('DB_USER', 'postgres'),
    'password' => env('DB_PASSWORD', 'postgres'),
    'charset' => 'utf8',
    // current_date / visit_date mengikuti jam rumah sakit, bukan UTC server.
    'on afterOpen' => static function ($event): void {
        $event->sender->createCommand('SELECT set_config(\'TimeZone\', :tz, false)', [
            ':tz' => env('APP_TIMEZONE', 'Asia/Jakarta'),
        ])->execute();
    },
    'enableSchemaCache' => !YII_DEBUG,
    'schemaCacheDuration' => 3600,
    'schemaCache' => 'cache',
];

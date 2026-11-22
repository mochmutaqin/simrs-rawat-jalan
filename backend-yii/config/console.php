<?php

declare(strict_types=1);

$params = require __DIR__ . '/params.php';
$db = require __DIR__ . '/db.php';

return [
    'id' => 'simrs-console',
    'basePath' => dirname(__DIR__),
    'language' => 'id-ID',
    'timeZone' => env('APP_TIMEZONE', 'Asia/Jakarta'),
    'bootstrap' => ['log'],
    'controllerNamespace' => 'app\commands',
    'aliases' => [
        '@bower' => '@vendor/bower-asset',
        '@npm' => '@vendor/npm-asset',
        '@tests' => '@app/tests',
    ],
    'controllerMap' => [
        'migrate' => [
            'class' => \yii\console\controllers\MigrateController::class,
            'migrationPath' => '@app/migrations',
        ],
    ],
    'components' => [
        'cache' => ['class' => \yii\caching\FileCache::class],
        'log' => [
            'targets' => [['class' => \yii\log\FileTarget::class, 'levels' => ['error', 'warning']]],
        ],
        'db' => $db,
    ],
    'params' => $params,
];

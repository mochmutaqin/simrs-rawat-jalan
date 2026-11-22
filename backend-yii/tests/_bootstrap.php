<?php

declare(strict_types=1);

require_once __DIR__ . '/../config/env.php';

defined('YII_DEBUG') or define('YII_DEBUG', true);
defined('YII_ENV') or define('YII_ENV', 'test');

require_once __DIR__ . '/../vendor/autoload.php';
require_once __DIR__ . '/../vendor/yiisoft/yii2/Yii.php';
Yii::setAlias('@app', dirname(__DIR__));
Yii::setAlias('@tests', __DIR__);

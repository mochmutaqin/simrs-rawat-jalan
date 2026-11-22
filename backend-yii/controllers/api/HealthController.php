<?php

declare(strict_types=1);

namespace app\controllers\api;

use Yii;

class HealthController extends BaseController
{
    protected function permissions(): array
    {
        return [];
    }

    protected function publicActions(): array
    {
        return ['index', 'options'];
    }

    protected function verbs(): array
    {
        return ['index' => ['GET'], 'options' => ['OPTIONS']];
    }

    /** GET /api/health */
    public function actionIndex(): array
    {
        try {
            Yii::$app->db->createCommand('SELECT 1')->queryScalar();
            $db = 'up';
        } catch (\Throwable) {
            $db = 'down';
            Yii::$app->response->statusCode = 503;
        }
        return ['success' => $db === 'up', 'data' => ['status' => $db === 'up' ? 'ok' : 'degraded', 'database' => $db]];
    }

    /** Preflight CORS (header diisi filter Cors). */
    public function actionOptions(): array
    {
        Yii::$app->response->statusCode = 204;
        return [];
    }
}

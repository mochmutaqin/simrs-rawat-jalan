<?php

declare(strict_types=1);

namespace app\components;

use Yii;
use yii\base\ActionFilter;

/** Untuk endpoint /internal/* yang hanya boleh dipanggil services-node. */
class ServiceTokenAuth extends ActionFilter
{
    public function beforeAction($action): bool
    {
        $token = (string) Yii::$app->request->headers->get('X-Service-Token');
        if (!hash_equals((string) Yii::$app->params['internal.serviceToken'], $token)) {
            throw ApiException::unauthorized('Service token tidak valid');
        }
        return parent::beforeAction($action);
    }
}

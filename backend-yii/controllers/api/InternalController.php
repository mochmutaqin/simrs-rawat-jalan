<?php

/**
 * SIMRS Rawat Jalan
 *
 * @author  Mochamad Mutaqin Kurniawan <mochmutaqin@gmail.com>
 * @link    https://github.com/mochmutaqin/simrs-rawat-jalan
 */

declare(strict_types=1);

namespace app\controllers\api;

use app\components\ApiException;
use app\components\ServiceTokenAuth;
use app\services\LabService;
use Yii;
use yii\filters\ContentNegotiator;
use yii\web\Response;

/**
 * Endpoint antar-service, hanya untuk services-node (header X-Service-Token).
 * Tidak memakai JWT user; identitas petugas dikirim sebagai resulted_by.
 */
class InternalController extends \yii\rest\Controller
{
    public $enableCsrfValidation = false;

    public function behaviors(): array
    {
        return [
            'contentNegotiator' => ['class' => ContentNegotiator::class, 'formats' => ['application/json' => Response::FORMAT_JSON]],
            'serviceToken' => ['class' => ServiceTokenAuth::class],
        ];
    }

    protected function verbs(): array
    {
        return ['lab-result' => ['PUT']];
    }

    /** PUT /internal/lab-items/{id}/result  Header: X-Service-Token, Idempotency-Key */
    public function actionLabResult(int $id): array
    {
        $key = (string) Yii::$app->request->headers->get('Idempotency-Key');
        if ($key === '') {
            throw ApiException::badRequest('Header Idempotency-Key wajib');
        }
        $body = Yii::$app->request->getBodyParams();
        $r = (new LabService())->saveResult($id, is_array($body) ? $body : [], $key);
        Yii::$app->response->statusCode = $r['status'];
        return ['success' => true, 'data' => $r['response'], 'meta' => ['replayed' => $r['replayed']]];
    }
}

<?php

/**
 * SIMRS Rawat Jalan
 *
 * @author  Mochamad Mutaqin Kurniawan <mochmutaqin@gmail.com>
 * @link    https://github.com/mochmutaqin/simrs-rawat-jalan
 */

declare(strict_types=1);

namespace app\controllers\api;

use app\models\LabRequest;
use app\models\Visit;
use app\services\LabService;

/**
 * Permintaan lab oleh dokter (Yii). Daftar kerja & input hasil untuk petugas lab ada di
 * services-node (/api/v1/lab/*), yang meneruskan penulisan ke /internal/lab-items/{id}/result.
 */
class LabController extends BaseController
{
    protected function permissions(): array
    {
        return [
            'by-visit' => ['lab.view', 'exam.view'],
            'create' => ['lab.request'],
            'cancel' => ['lab.request'],
        ];
    }

    protected function verbs(): array
    {
        return ['by-visit' => ['GET'], 'create' => ['POST'], 'cancel' => ['POST']];
    }

    /** GET /api/visits/{id}/lab-requests */
    public function actionByVisit(int $id): array
    {
        Visit::findOrFail($id);
        return $this->ok(LabRequest::find()->where(['visit_id' => $id])->with('items.labTest')->orderBy('id')->all());
    }

    /** POST /api/visits/{id}/lab-requests {test_ids: [..], notes?} */
    public function actionCreate(int $id): array
    {
        $req = (new LabService())->request($id, $this->body(), $this->user());
        return $this->created(LabRequest::find()->where(['id' => $req->id])->with('items.labTest')->one());
    }

    /** POST /api/lab-requests/{id}/cancel {reason} */
    public function actionCancel(int $id): array
    {
        return $this->ok((new LabService())->cancel($id, $this->body()['reason'] ?? null, $this->user()));
    }
}

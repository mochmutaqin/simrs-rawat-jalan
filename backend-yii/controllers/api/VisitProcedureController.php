<?php

/**
 * SIMRS Rawat Jalan
 *
 * @author  Mochamad Mutaqin Kurniawan <mochmutaqin@gmail.com>
 * @link    https://github.com/mochmutaqin/simrs-rawat-jalan
 */

declare(strict_types=1);

namespace app\controllers\api;

use app\models\Visit;
use app\models\VisitProcedure;
use app\services\ProcedureService;

/** Tindakan medis per kunjungan. */
class VisitProcedureController extends BaseController
{
    protected function permissions(): array
    {
        return [
            'index' => ['exam.view', 'billing.view'],
            'create' => ['procedure.manage'],
            'delete' => ['procedure.manage'],
        ];
    }

    protected function verbs(): array
    {
        return ['index' => ['GET'], 'create' => ['POST'], 'delete' => ['DELETE', 'POST']];
    }

    /** GET /api/visits/{id}/procedures?include_voided=1 */
    public function actionIndex(int $id): array
    {
        Visit::findOrFail($id);
        $q = VisitProcedure::find()->with('procedure')->where(['visit_id' => $id])->orderBy('id');
        if (!filter_var(\Yii::$app->request->get('include_voided'), FILTER_VALIDATE_BOOLEAN)) {
            $q->andWhere(['voided_at' => null]);
        }
        $rows = $q->all();
        $total = array_sum(array_map(fn ($r) => $r->voided_at === null ? (float) $r->unit_price * (int) $r->quantity : 0, $rows));
        return $this->ok($rows, ['total' => $total]);
    }

    /** POST /api/visits/{id}/procedures {procedure_id, quantity?, notes?} */
    public function actionCreate(int $id): array
    {
        $vp = (new ProcedureService())->add($id, $this->body(), $this->user());
        return $this->created(VisitProcedure::find()->with('procedure')->where(['id' => $vp->id])->one());
    }

    /** DELETE /api/visits/{id}/procedures/{pid} {reason} */
    public function actionDelete(int $id, int $pid): array
    {
        $reason = $this->body()['reason'] ?? \Yii::$app->request->get('reason');
        return $this->ok((new ProcedureService())->void($id, $pid, $reason, $this->user()));
    }
}

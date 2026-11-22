<?php

/**
 * SIMRS Rawat Jalan
 *
 * @author  Mochamad Mutaqin Kurniawan <mochmutaqin@gmail.com>
 * @link    https://github.com/mochmutaqin/simrs-rawat-jalan
 */

declare(strict_types=1);

namespace app\services;

use app\components\ApiException;
use app\components\Tx;
use app\models\Procedure;
use app\models\User;
use app\models\Visit;
use app\models\VisitProcedure;

/** Tindakan medis: tercatat sekaligus sebagai komponen tagihan. */
final class ProcedureService
{
    public function __construct(private readonly BillingService $billing = new BillingService())
    {
    }

    public function add(int $visitId, array $data, User $user): VisitProcedure
    {
        $procedureId = (int) ($data['procedure_id'] ?? 0);
        $qty = (int) ($data['quantity'] ?? 1);
        if ($qty < 1 || $qty > 100) {
            throw new ApiException(422, 'VALIDATION_ERROR', 'Validasi data gagal', [['field' => 'quantity', 'message' => 'Jumlah 1-100']]);
        }
        $procedure = Procedure::findOne(['id' => $procedureId, 'is_active' => true]);
        if ($procedure === null) {
            throw ApiException::unprocessable('INVALID_PROCEDURE', 'Tindakan tidak ditemukan atau nonaktif');
        }

        return Tx::run(function () use ($visitId, $procedure, $qty, $data, $user) {
            $visit = Visit::lockOrFail($visitId);
            $visit->assertActive();
            AccessGuard::assertCanTreat($visit, $user);

            $vp = new VisitProcedure([
                'visit_id' => $visit->id,
                'procedure_id' => $procedure->id,
                'quantity' => $qty,
                'unit_price' => $procedure->price,            // snapshot tarif
                'notes' => isset($data['notes']) ? mb_substr(trim((string) $data['notes']), 0, 500) : null,
                'performed_by' => AccessGuard::actingDoctorId($visit, $user),
            ]);
            $vp->saveOrFail(false);
            $this->billing->addItem($visit->id, 'procedure', (int) $vp->id, $procedure->name, $qty, (float) $procedure->price);
            return $vp;
        }, 'Tambah tindakan');
    }

    public function void(int $visitId, int $visitProcedureId, ?string $reason, User $user): VisitProcedure
    {
        $reason = BillingService::requireReason($reason);
        return Tx::run(function () use ($visitId, $visitProcedureId, $reason, $user) {
            $visit = Visit::lockOrFail($visitId);
            AccessGuard::assertCanTreat($visit, $user);
            $vp = VisitProcedure::findOne(['id' => $visitProcedureId, 'visit_id' => $visit->id]);
            if ($vp === null) {
                throw ApiException::notFound('Tindakan tidak ditemukan pada kunjungan ini');
            }
            if ($vp->voided_at !== null) {
                throw ApiException::conflict('ALREADY_VOIDED', 'Tindakan sudah dibatalkan');
            }
            $vp->voided_at = new \yii\db\Expression('now()');
            $vp->void_reason = $reason;
            $vp->saveOrFail(false);
            $this->billing->voidItem($visit->id, 'procedure', (int) $vp->id, $reason);
            $vp->refresh();
            return $vp;
        }, 'Batal tindakan: ' . $reason);
    }
}

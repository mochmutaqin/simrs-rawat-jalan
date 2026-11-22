<?php

declare(strict_types=1);

namespace app\services;

use app\components\ApiException;
use app\components\Tx;
use app\models\LabRequest;
use app\models\LabRequestItem;
use app\models\LabTest;
use app\models\User;
use app\models\Visit;

/** Pemeriksaan penunjang (laboratorium). */
final class LabService
{
    public function __construct(
        private readonly BillingService $billing = new BillingService(),
        private readonly OutboxService $outbox = new OutboxService(),
        private readonly IdempotencyService $idempotency = new IdempotencyService(),
    ) {
    }

    public function request(int $visitId, array $data, User $user): LabRequest
    {
        $testIds = array_values(array_unique(array_map('intval', (array) ($data['test_ids'] ?? []))));
        if ($testIds === []) {
            throw new ApiException(422, 'VALIDATION_ERROR', 'Validasi data gagal', [['field' => 'test_ids', 'message' => 'Pilih minimal satu pemeriksaan']]);
        }
        $tests = LabTest::find()->where(['id' => $testIds, 'is_active' => true])->indexBy('id')->all();
        $missing = array_diff($testIds, array_keys($tests));
        if ($missing) {
            throw ApiException::unprocessable('INVALID_LAB_TEST', 'Jenis pemeriksaan tidak ditemukan/nonaktif: ' . implode(', ', $missing));
        }

        return Tx::run(function () use ($visitId, $tests, $data, $user) {
            $visit = Visit::lockOrFail($visitId);
            $visit->assertActive();
            AccessGuard::assertCanTreat($visit, $user);

            $req = new LabRequest([
                'visit_id' => $visit->id,
                'requested_by' => AccessGuard::actingDoctorId($visit, $user),
                'status' => 'requested',
                'notes' => isset($data['notes']) ? mb_substr(trim((string) $data['notes']), 0, 500) : null,
            ]);
            $req->saveOrFail(false);
            foreach ($tests as $test) {
                $item = new LabRequestItem([
                    'lab_request_id' => $req->id,
                    'lab_test_id' => $test->id,
                    'unit_price' => $test->price,
                    'result_unit' => $test->unit,
                    'ref_range' => $test->ref_range,
                ]);
                $item->saveOrFail(false);
                $this->billing->addItem($visit->id, 'lab', (int) $item->id, 'Lab: ' . $test->name, 1, (float) $test->price);
            }
            $this->outbox->record('lab.requested', 'lab_request', (int) $req->id, [
                'lab_request_id' => (int) $req->id,
                'visit_id' => (int) $visit->id,
                'medical_record_no' => $visit->patient->medical_record_no,
                'tests' => array_values(array_map(fn ($t) => $t->code, $tests)),
            ]);
            return $req;
        }, 'Permintaan lab');
    }

    public function cancel(int $requestId, ?string $reason, User $user): LabRequest
    {
        $reason = BillingService::requireReason($reason);
        return Tx::run(function () use ($requestId, $reason, $user) {
            $req = LabRequest::findOrFail($requestId);
            $visit = Visit::lockOrFail((int) $req->visit_id);
            AccessGuard::assertCanTreat($visit, $user);
            $req->refresh();
            if (!in_array($req->status, ['requested'], true)) {
                throw ApiException::conflict('INVALID_STATUS', 'Permintaan yang sudah diproses lab tidak bisa dibatalkan');
            }
            foreach ($req->items as $item) {
                $item->voided_at = new \yii\db\Expression('now()');
                $item->saveOrFail(false);
                $this->billing->voidItem($visit->id, 'lab', (int) $item->id, $reason);
            }
            $req->status = 'cancelled';
            $req->saveOrFail(false);
            return $req;
        }, 'Batal permintaan lab: ' . $reason);
    }

    /**
     * Simpan hasil (dipanggil services-node lewat /internal). Idempoten per Idempotency-Key.
     * @return array{status:int, response:array, replayed:bool}
     */
    public function saveResult(int $itemId, array $data, string $idempotencyKey): array
    {
        $resultedBy = isset($data['resulted_by']) ? (int) $data['resulted_by'] : null;
        $payload = array_intersect_key($data, array_flip(['result_value', 'result_unit', 'result_flag', 'result_notes']));

        return Tx::run(function () use ($itemId, $payload, $resultedBy, $idempotencyKey) {
            return $this->idempotency->run('lab.result', $idempotencyKey, ['item' => $itemId] + $payload,
                function () use ($itemId, $payload, $resultedBy) {
                    $item = LabRequestItem::findBySql('SELECT * FROM lab_request_items WHERE id = :id FOR UPDATE', [':id' => $itemId])->one();
                    if ($item === null || $item->voided_at !== null) {
                        throw ApiException::notFound('Item pemeriksaan lab tidak ditemukan');
                    }
                    $req = $item->request;
                    if ($req->status === 'cancelled') {
                        throw ApiException::conflict('LAB_REQUEST_CANCELLED', 'Permintaan lab sudah dibatalkan');
                    }
                    $item->setAttributes($payload, false);
                    if (!$item->validate(['result_value', 'result_unit', 'result_flag', 'result_notes'])) {
                        throw ApiException::validation($item);
                    }
                    $item->resulted_by = $resultedBy;
                    $item->resulted_at = new \yii\db\Expression('now()');
                    $item->saveOrFail(false);

                    $pending = LabRequestItem::find()
                        ->where(['lab_request_id' => $req->id, 'voided_at' => null, 'resulted_at' => null])->count();
                    $req->status = (int) $pending === 0 ? 'completed' : 'in_progress';
                    $req->saveOrFail(false);

                    return [200, ['id' => (int) $item->id, 'saved' => true, 'request_status' => $req->status]];
                });
        }, 'Input hasil lab', $resultedBy);
    }
}

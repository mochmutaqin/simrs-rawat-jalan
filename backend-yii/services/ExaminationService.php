<?php

declare(strict_types=1);

namespace app\services;

use app\components\ApiException;
use app\components\Tx;
use app\models\Examination;
use app\models\ExaminationDiagnosis;
use app\models\User;
use app\models\Visit;

/**
 * Pemeriksaan & rekam medis. Skenario D4 (perubahan data setelah final/billing):
 *  - pemeriksaan final tetap bisa dikoreksi, tetapi WAJIB dengan alasan;
 *  - diagnosis tidak di-update di tempat: baris lama di-void (alasan tersimpan), baris baru ditambahkan;
 *  - setiap perubahan tercatat di audit_logs (old/new, user, alasan) lewat trigger;
 *  - version naik setiap kali disimpan ulang.
 */
final class ExaminationService
{
    public function save(int $visitId, array $data, User $user): Examination
    {
        return Tx::run(function () use ($visitId, $data, $user) {
            $visit = Visit::lockOrFail($visitId);
            $visit->assertActive();
            AccessGuard::assertCanTreat($visit, $user);

            $exam = $visit->examination;
            $isNew = $exam === null;
            $reason = null;
            if ($isNew) {
                $exam = new Examination([
                    'visit_id' => $visit->id,
                    'doctor_id' => AccessGuard::actingDoctorId($visit, $user),
                    'status' => 'draft',
                    'version' => 1,
                ]);
            } elseif ($exam->status === 'final') {
                $reason = BillingService::requireReason($data['reason'] ?? null);
            }
            if ($reason !== null) {
                \Yii::$app->db->createCommand("SELECT set_config('app.change_reason', :r, true)", [':r' => $reason])->execute();
            }

            $exam->setAttributes(array_intersect_key($data, array_flip(Examination::CLINICAL_FIELDS)), false);
            if (!$exam->validate(Examination::CLINICAL_FIELDS)) {
                throw ApiException::validation($exam);
            }
            if (!$isNew) {
                $exam->version = (int) $exam->version + 1;
            }
            $exam->saveOrFail(false);

            if (array_key_exists('diagnoses', $data)) {
                $this->syncDiagnoses($exam, (array) $data['diagnoses'], $reason ?? 'Diubah dokter');
            }
            if ($visit->status === 'waiting') {
                $visit->status = 'in_exam';
                $visit->saveOrFail(false);
            }
            $exam->refresh();
            return $exam;
        }, 'Simpan pemeriksaan');
    }

    public function finalize(int $visitId, User $user): Examination
    {
        return Tx::run(function () use ($visitId, $user) {
            $visit = Visit::lockOrFail($visitId);
            $visit->assertActive();
            AccessGuard::assertCanTreat($visit, $user);
            $exam = $visit->examination;
            if ($exam === null) {
                throw ApiException::unprocessable('EXAM_EMPTY', 'Pemeriksaan belum diisi');
            }
            if ($exam->status === 'final') {
                return $exam;
            }
            $primary = array_filter($exam->diagnoses, fn ($d) => $d->diagnosis_type === 'primary');
            if (count($primary) !== 1) {
                throw ApiException::unprocessable('PRIMARY_DIAGNOSIS_REQUIRED', 'Diagnosis utama wajib diisi sebelum pemeriksaan diselesaikan');
            }
            $exam->status = 'final';
            $exam->saveOrFail(false);
            if (in_array($visit->status, ['waiting', 'in_exam'], true)) {
                $visit->status = 'exam_done';
                $visit->saveOrFail(false);
            }
            return $exam;
        }, 'Finalisasi pemeriksaan');
    }

    /**
     * Sinkronkan daftar diagnosis: yang hilang di-void, yang baru ditambah, yang sama dibiarkan.
     */
    private function syncDiagnoses(Examination $exam, array $incoming, string $reason): void
    {
        $wanted = [];
        $errors = [];
        foreach (array_values($incoming) as $i => $row) {
            $d = new ExaminationDiagnosis();
            $d->setAttributes([
                'icd10_code' => $row['icd10_code'] ?? null,
                'diagnosis_name' => $row['diagnosis_name'] ?? null,
                'diagnosis_type' => $row['diagnosis_type'] ?? null,
            ], false);
            if (!$d->validate(['icd10_code', 'diagnosis_name', 'diagnosis_type'])) {
                foreach ($d->getErrors() as $field => $msgs) {
                    $errors[] = ['field' => "diagnoses.$i.$field", 'message' => $msgs[0]];
                }
                continue;
            }
            $key = $d->icd10_code;
            if (isset($wanted[$key])) {
                $errors[] = ['field' => "diagnoses.$i.icd10_code", 'message' => 'Kode ICD-10 duplikat'];
                continue;
            }
            $wanted[$key] = $d;
        }
        $primaryCount = count(array_filter($wanted, fn ($d) => $d->diagnosis_type === 'primary'));
        if ($primaryCount > 1) {
            $errors[] = ['field' => 'diagnoses', 'message' => 'Hanya boleh satu diagnosis utama'];
        }
        if ($errors) {
            throw new ApiException(422, 'VALIDATION_ERROR', 'Validasi diagnosis gagal', $errors);
        }

        // void dulu (termasuk yang berubah tipe), baru insert -> unique index diagnosis utama aman
        foreach ($exam->diagnoses as $current) {
            $w = $wanted[$current->icd10_code] ?? null;
            if ($w !== null && $w->diagnosis_type === $current->diagnosis_type && $w->diagnosis_name === $current->diagnosis_name) {
                unset($wanted[$current->icd10_code]);      // tidak berubah
                continue;
            }
            $current->voided_at = new \yii\db\Expression('now()');
            $current->void_reason = $reason;
            $current->saveOrFail(false);
        }
        foreach ($wanted as $d) {
            $d->examination_id = $exam->id;
            $d->saveOrFail(false);
        }
        unset($exam->diagnoses);
    }
}

<?php

/**
 * SIMRS Rawat Jalan
 *
 * @author  Mochamad Mutaqin Kurniawan <mochmutaqin@gmail.com>
 * @link    https://github.com/mochmutaqin/simrs-rawat-jalan
 */

declare(strict_types=1);

namespace app\controllers\api;

use app\models\Patient;
use app\models\Visit;
use app\services\AccessGuard;
use app\services\ExaminationService;
use Yii;

/** Pemeriksaan dokter & rekam medis elektronik. */
class ExaminationController extends BaseController
{
    protected function permissions(): array
    {
        return [
            'queue' => ['exam.view'],
            'view' => ['exam.view'],
            'save' => ['exam.manage'],
            'finalize' => ['exam.manage'],
            'medical-record' => ['exam.view'],
            'history' => ['exam.view'],
        ];
    }

    protected function verbs(): array
    {
        return ['queue' => ['GET'], 'view' => ['GET'], 'save' => ['PUT'], 'finalize' => ['POST'], 'medical-record' => ['GET'], 'history' => ['GET']];
    }

    /** GET /api/examinations/queue?date= : pasien menunggu/diperiksa milik dokter yang login */
    public function actionQueue(): array
    {
        $user = $this->user();
        $date = $this->dateParam('date', $this->today());
        $query = Visit::find()->with(['patient', 'poli', 'doctor', 'examination'])
            ->where(['visit_date' => $date])
            ->andWhere(['status' => array_filter(explode(',', (string) Yii::$app->request->get('status', 'waiting,in_exam,exam_done')))])
            ->orderBy(['queue_number' => SORT_ASC]);
        if (!AccessGuard::isAdmin($user)) {
            $query->andWhere(['doctor_id' => $user->doctorStaffId() ?? 0]);
        }
        return $this->ok(array_map(fn (Visit $v) => $v->toArray() + [
            'exam_status' => $v->examination?->status,
        ], $query->all()), ['date' => $date]);
    }

    /** GET /api/visits/{id}/examination */
    public function actionView(int $id): array
    {
        $visit = Visit::findOrFail($id);
        return $this->ok($visit->examination);
    }

    /** PUT /api/visits/{id}/examination {anamnesis, vital sign..., diagnoses: [...], reason?} */
    public function actionSave(int $id): array
    {
        return $this->ok((new ExaminationService())->save($id, $this->body(), $this->user()));
    }

    /** POST /api/visits/{id}/examination/finalize */
    public function actionFinalize(int $id): array
    {
        return $this->ok((new ExaminationService())->finalize($id, $this->user()));
    }

    /** GET /api/patients/{id}/medical-records : riwayat lengkap per kunjungan */
    public function actionMedicalRecord(int $id): array
    {
        $patient = Patient::findActiveOrFail($id);
        $visits = Visit::find()->where(['patient_id' => $id])->andWhere(['<>', 'status', 'cancelled'])
            ->with(['poli', 'doctor', 'examination.diagnoses'])
            ->orderBy(['visit_date' => SORT_DESC, 'id' => SORT_DESC])->limit(50)->all();
        $ids = array_map(fn ($v) => (int) $v->id, $visits);

        $procedures = $this->groupByVisit((new \yii\db\Query())
            ->select(['vp.visit_id', 'p.code', 'p.name', 'vp.quantity', 'vp.notes'])
            ->from(['vp' => 'visit_procedures'])->innerJoin(['p' => 'procedures'], 'p.id = vp.procedure_id')
            ->where(['vp.visit_id' => $ids, 'vp.voided_at' => null])->orderBy('vp.id')->all());
        $medications = $this->groupByVisit((new \yii\db\Query())
            ->select(['pr.visit_id', 'pr.status', 'm.name', 'i.dose', 'i.frequency', 'i.quantity', 'm.unit'])
            ->from(['i' => 'prescription_items'])->innerJoin(['pr' => 'prescriptions'], 'pr.id = i.prescription_id')
            ->innerJoin(['m' => 'medicines'], 'm.id = i.medicine_id')
            ->where(['pr.visit_id' => $ids, 'i.voided_at' => null])->andWhere(['<>', 'pr.status', 'cancelled'])->orderBy('i.id')->all());
        $labs = $this->groupByVisit((new \yii\db\Query())
            ->select(['lr.visit_id', 't.code', 't.name', 'li.result_value', 'li.result_unit', 'li.ref_range', 'li.result_flag', 'li.resulted_at'])
            ->from(['li' => 'lab_request_items'])->innerJoin(['lr' => 'lab_requests'], 'lr.id = li.lab_request_id')
            ->innerJoin(['t' => 'lab_tests'], 't.id = li.lab_test_id')
            ->where(['lr.visit_id' => $ids, 'li.voided_at' => null])->andWhere(['<>', 'lr.status', 'cancelled'])->orderBy('li.id')->all());

        return $this->ok([
            'patient' => $patient,
            'visits' => array_map(fn (Visit $v) => [
                'visit_id' => (int) $v->id,
                'visit_date' => $v->visit_date,
                'poli' => $v->poli->name,
                'doctor' => $v->doctor->name,
                'status' => $v->status,
                'examination' => $v->examination?->toArray(),
                'procedures' => $procedures[$v->id] ?? [],
                'medications' => $medications[$v->id] ?? [],
                'lab_results' => $labs[$v->id] ?? [],
            ], $visits),
        ]);
    }

    /** GET /api/visits/{id}/examination/history : jejak perubahan (audit) */
    public function actionHistory(int $id): array
    {
        $visit = Visit::findOrFail($id);
        $exam = $visit->examination;
        if ($exam === null) {
            return $this->ok([]);
        }
        $diagIds = (new \yii\db\Query())->select('id')->from('examination_diagnoses')->where(['examination_id' => $exam->id])->column();
        $rows = (new \yii\db\Query())
            ->select(['a.id', 'a.table_name', 'a.action', 'a.old_data', 'a.new_data', 'a.reason', 'a.changed_at', 'changed_by' => 'u.full_name'])
            ->from(['a' => 'audit_logs'])->leftJoin(['u' => 'users'], 'u.id = a.changed_by')
            ->where(['or',
                ['a.table_name' => 'examinations', 'a.record_id' => (string) $exam->id],
                ['a.table_name' => 'examination_diagnoses', 'a.record_id' => array_map('strval', $diagIds)],
            ])->orderBy(['a.id' => SORT_ASC])->all();
        foreach ($rows as &$r) {
            $r['old_data'] = $r['old_data'] ? json_decode($r['old_data'], true) : null;
            $r['new_data'] = $r['new_data'] ? json_decode($r['new_data'], true) : null;
        }
        return $this->ok($rows);
    }

    private function groupByVisit(array $rows): array
    {
        $out = [];
        foreach ($rows as $r) {
            $vid = (int) $r['visit_id'];
            unset($r['visit_id']);
            $out[$vid][] = $r;
        }
        return $out;
    }
}

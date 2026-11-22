<?php

declare(strict_types=1);

namespace app\controllers\api;

use app\models\Patient;
use app\models\Visit;
use app\services\RegistrationService;
use Yii;

/** Pendaftaran kunjungan & antrean. */
class VisitController extends BaseController
{
    private RegistrationService $service;

    public function init(): void
    {
        parent::init();
        $this->service = new RegistrationService();
    }

    protected function permissions(): array
    {
        return [
            'index' => ['queue.view', 'exam.view', 'billing.view'],
            'view' => ['queue.view', 'exam.view', 'billing.view', 'prescription.view', 'lab.view'],
            'create' => ['registration.manage'],
            'cancel' => ['registration.manage'],
            'call' => ['exam.manage'],
            'patient-history' => ['queue.view', 'exam.view', 'billing.view'],
        ];
    }

    protected function verbs(): array
    {
        return ['index' => ['GET'], 'view' => ['GET'], 'create' => ['POST'], 'cancel' => ['POST'], 'call' => ['POST'], 'patient-history' => ['GET']];
    }

    /** GET /api/visits?date=&poli_id=&doctor_id=&status=&q= (default hari ini) */
    public function actionIndex(): array
    {
        $req = Yii::$app->request;
        $date = $this->dateParam('date', $this->today());
        $query = Visit::find()->alias('v')->joinWith(['patient p', 'poli', 'doctor'])
            ->where(['v.visit_date' => $date])
            ->andFilterWhere(['v.poli_id' => $req->get('poli_id'), 'v.doctor_id' => $req->get('doctor_id'), 'v.status' => $req->get('status')])
            ->orderBy(['v.doctor_id' => SORT_ASC, 'v.queue_number' => SORT_ASC]);
        if (($q = trim((string) $req->get('q', ''))) !== '') {
            $query->andWhere(['or', ['ilike', 'p.name', $q], ['ilike', 'p.medical_record_no', $q]]);
        }
        [$rows, $meta] = $this->paginate($query);

        $summary = (new \yii\db\Query())->select(['status', 'n' => 'count(*)'])->from('visits')
            ->where(['visit_date' => $date])->andFilterWhere(['poli_id' => $req->get('poli_id'), 'doctor_id' => $req->get('doctor_id')])
            ->groupBy('status')->all();
        $meta['date'] = $date;
        $meta['status_count'] = array_map('intval', array_column($summary, 'n', 'status'));
        return $this->ok($rows, $meta);
    }

    public function actionView(int $id): array
    {
        $visit = Visit::findOrFail($id);
        return $this->ok($visit->toArray() + [
            'examination' => $visit->examination?->toArray(),
            'invoice' => $visit->invoice?->toArray(),
        ]);
    }

    /** POST /api/visits {patient_id, schedule_id, visit_date?, notes?} */
    public function actionCreate(): array
    {
        $visit = $this->service->register($this->body(), $this->user());
        return $this->created(Visit::findOne($visit->id));
    }

    /** POST /api/visits/{id}/cancel {reason} */
    public function actionCancel(int $id): array
    {
        return $this->ok($this->service->cancel($id, $this->body()['reason'] ?? null, $this->user()));
    }

    /** POST /api/visits/{id}/call : dokter memanggil pasien */
    public function actionCall(int $id): array
    {
        return $this->ok($this->service->call($id, $this->user()));
    }

    /** GET /api/patients/{id}/visits : riwayat kunjungan */
    public function actionPatientHistory(int $id): array
    {
        Patient::findActiveOrFail($id);
        [$rows, $meta] = $this->paginate(Visit::find()->where(['patient_id' => $id])
            ->with(['poli', 'doctor', 'patient'])->orderBy(['visit_date' => SORT_DESC, 'id' => SORT_DESC]));
        return $this->ok($rows, $meta);
    }
}

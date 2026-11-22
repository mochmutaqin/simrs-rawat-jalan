<?php

declare(strict_types=1);

namespace app\controllers\api;

use app\models\Patient;
use app\models\Prescription;
use app\models\Visit;
use app\services\PrescriptionService;
use Yii;

/** Resep (dokter) dan antrean farmasi. */
class PrescriptionController extends BaseController
{
    protected function permissions(): array
    {
        return [
            'index' => ['prescription.view'],
            'view' => ['prescription.view'],
            'by-visit' => ['prescription.view', 'exam.view'],
            'create' => ['prescription.manage'],
            'cancel' => ['prescription.manage', 'pharmacy.process'],
            'dispense' => ['pharmacy.process'],
            'patient-medications' => ['prescription.view', 'exam.view'],
        ];
    }

    protected function verbs(): array
    {
        return ['index' => ['GET'], 'view' => ['GET'], 'by-visit' => ['GET'], 'create' => ['POST'],
            'cancel' => ['POST'], 'dispense' => ['POST'], 'patient-medications' => ['GET']];
    }

    /** GET /api/prescriptions?status=pending&date= : worklist farmasi */
    public function actionIndex(): array
    {
        $req = Yii::$app->request;
        $query = Prescription::find()->alias('pr')->innerJoinWith(['visit v'])->with(['items.medicine', 'visit.patient', 'visit.poli', 'visit.doctor'])
            ->andFilterWhere(['pr.status' => $req->get('status')])
            ->orderBy(['pr.id' => SORT_ASC]);
        $date = $this->dateParam('date');
        if ($date !== null) {
            $query->andWhere(['v.visit_date' => $date]);
        }
        [$rows, $meta] = $this->paginate($query);
        return $this->ok(array_map(fn (Prescription $p) => $p->toArray() + ['visit' => $p->visit->toArray()], $rows), $meta);
    }

    public function actionView(int $id): array
    {
        $p = Prescription::findOrFail($id);
        return $this->ok($p->toArray() + ['visit' => $p->visit->toArray()]);
    }

    /** GET /api/visits/{id}/prescriptions */
    public function actionByVisit(int $id): array
    {
        Visit::findOrFail($id);
        return $this->ok(Prescription::find()->where(['visit_id' => $id])->with('items.medicine')->orderBy('id')->all());
    }

    /** POST /api/visits/{id}/prescriptions {notes?, items: [{medicine_id, dose, frequency, quantity, instructions?}]} */
    public function actionCreate(int $id): array
    {
        $p = (new PrescriptionService())->create($id, $this->body(), $this->user());
        return $this->created(Prescription::find()->where(['id' => $p->id])->with('items.medicine')->one());
    }

    /** POST /api/prescriptions/{id}/cancel {reason} */
    public function actionCancel(int $id): array
    {
        return $this->ok((new PrescriptionService())->cancel($id, $this->body()['reason'] ?? null, $this->user()));
    }

    /** POST /api/prescriptions/{id}/dispense : serahkan obat, stok berkurang, masuk tagihan */
    public function actionDispense(int $id): array
    {
        return $this->ok((new PrescriptionService())->dispense($id, $this->user()));
    }

    /** GET /api/patients/{id}/medications : riwayat penggunaan obat */
    public function actionPatientMedications(int $id): array
    {
        Patient::findActiveOrFail($id);
        $query = (new \yii\db\Query())
            ->select(['v.visit_date', 'visit_id' => 'v.id', 'prescription_id' => 'pr.id', 'pr.status', 'pr.dispensed_at',
                'm.code', 'm.name', 'm.unit', 'i.dose', 'i.frequency', 'i.quantity', 'doctor' => 'd.name'])
            ->from(['i' => 'prescription_items'])
            ->innerJoin(['pr' => 'prescriptions'], 'pr.id = i.prescription_id')
            ->innerJoin(['v' => 'visits'], 'v.id = pr.visit_id')
            ->innerJoin(['m' => 'medicines'], 'm.id = i.medicine_id')
            ->innerJoin(['d' => 'medical_staff'], 'd.id = pr.doctor_id')
            ->where(['v.patient_id' => $id, 'i.voided_at' => null])
            ->andWhere(['<>', 'pr.status', 'cancelled'])
            ->orderBy(['v.visit_date' => SORT_DESC, 'i.id' => SORT_ASC]);
        [$rows, $meta] = $this->paginate($query);
        return $this->ok($rows, $meta);
    }
}

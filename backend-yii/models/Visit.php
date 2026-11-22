<?php

/**
 * SIMRS Rawat Jalan
 *
 * @author  Mochamad Mutaqin Kurniawan <mochmutaqin@gmail.com>
 * @link    https://github.com/mochmutaqin/simrs-rawat-jalan
 */

declare(strict_types=1);

namespace app\models;

/**
 * Kunjungan rawat jalan. Status: waiting -> in_exam -> exam_done -> completed, atau cancelled.
 *
 * @property int $id
 * @property int $patient_id
 * @property int $poli_id
 * @property int $doctor_id
 * @property int|null $schedule_id
 * @property string $visit_date
 * @property int $queue_number
 * @property string $status
 * @property string $registration_fee
 * @property string|null $notes
 * @property int|null $created_by
 * @property string $created_at
 * @property-read Patient $patient
 * @property-read Poli $poli
 * @property-read MedicalStaff $doctor
 * @property-read Invoice|null $invoice
 * @property-read Examination|null $examination
 */
class Visit extends BaseModel
{
    public const STATUSES = ['waiting', 'in_exam', 'exam_done', 'completed', 'cancelled'];

    public static function tableName(): string
    {
        return 'visits';
    }

    protected static function label(): string
    {
        return 'Kunjungan';
    }

    protected static function casts(): array
    {
        return ['patient_id' => 'int', 'poli_id' => 'int', 'doctor_id' => 'int', 'schedule_id' => 'int',
            'queue_number' => 'int', 'registration_fee' => 'float', 'created_by' => 'int'];
    }

    public function fields(): array
    {
        return parent::fields() + [
            'queue_code' => fn () => sprintf('%s-%03d', $this->poli->code, $this->queue_number),
            'patient' => fn () => $this->patient->toArray(['id', 'medical_record_no', 'name', 'gender', 'birth_date']),
            'poli_name' => fn () => $this->poli->name,
            'doctor_name' => fn () => $this->doctor->name,
        ];
    }

    public function getPatient()
    {
        return $this->hasOne(Patient::class, ['id' => 'patient_id']);
    }

    public function getPoli()
    {
        return $this->hasOne(Poli::class, ['id' => 'poli_id']);
    }

    public function getDoctor()
    {
        return $this->hasOne(MedicalStaff::class, ['id' => 'doctor_id']);
    }

    public function getInvoice()
    {
        return $this->hasOne(Invoice::class, ['visit_id' => 'id']);
    }

    public function getExamination()
    {
        return $this->hasOne(Examination::class, ['visit_id' => 'id']);
    }

    /** Kunci baris kunjungan selama transaksi (SELECT ... FOR UPDATE). */
    public static function lockOrFail(int $id): self
    {
        $sql = self::find()->where(['id' => $id])->createCommand()->getRawSql() . ' FOR UPDATE';
        $visit = self::findBySql($sql)->one();
        if ($visit === null) {
            throw \app\components\ApiException::notFound('Kunjungan tidak ditemukan');
        }
        return $visit;
    }

    public function assertActive(): void
    {
        if ($this->status === 'cancelled') {
            throw \app\components\ApiException::conflict('VISIT_CANCELLED', 'Kunjungan sudah dibatalkan');
        }
    }
}

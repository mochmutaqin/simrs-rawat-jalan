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
 * @property int $id
 * @property int $visit_id
 * @property int $doctor_id
 * @property string|null $anamnesis
 * @property string|null $chief_complaint
 * @property int|null $bp_systolic
 * @property int|null $bp_diastolic
 * @property int|null $heart_rate
 * @property int|null $resp_rate
 * @property string|null $temperature
 * @property int|null $spo2
 * @property string|null $weight_kg
 * @property string|null $height_cm
 * @property string|null $physical_exam
 * @property string $status draft|final
 * @property int $version
 * @property-read ExaminationDiagnosis[] $diagnoses
 */
class Examination extends BaseModel
{
    public const CLINICAL_FIELDS = ['anamnesis', 'chief_complaint', 'bp_systolic', 'bp_diastolic', 'heart_rate',
        'resp_rate', 'temperature', 'spo2', 'weight_kg', 'height_cm', 'physical_exam'];

    public static function tableName(): string
    {
        return 'examinations';
    }

    protected static function label(): string
    {
        return 'Pemeriksaan';
    }

    protected static function casts(): array
    {
        return ['visit_id' => 'int', 'doctor_id' => 'int', 'bp_systolic' => 'int', 'bp_diastolic' => 'int',
            'heart_rate' => 'int', 'resp_rate' => 'int', 'temperature' => 'float', 'spo2' => 'int',
            'weight_kg' => 'float', 'height_cm' => 'float', 'version' => 'int'];
    }

    public function rules(): array
    {
        return [
            [['anamnesis', 'chief_complaint', 'physical_exam'], 'trim'],
            [['anamnesis', 'physical_exam'], 'string', 'max' => 5000],
            ['chief_complaint', 'string', 'max' => 500],
            ['bp_systolic', 'integer', 'min' => 30, 'max' => 300],
            ['bp_diastolic', 'integer', 'min' => 20, 'max' => 200],
            ['heart_rate', 'integer', 'min' => 20, 'max' => 300],
            ['resp_rate', 'integer', 'min' => 4, 'max' => 80],
            ['temperature', 'number', 'min' => 25, 'max' => 45],
            ['spo2', 'integer', 'min' => 0, 'max' => 100],
            ['weight_kg', 'number', 'min' => 0.5, 'max' => 500],
            ['height_cm', 'number', 'min' => 20, 'max' => 300],
            ['bp_diastolic', 'compare', 'compareAttribute' => 'bp_systolic', 'operator' => '<', 'type' => 'number',
                'when' => fn () => $this->bp_systolic !== null && $this->bp_diastolic !== null,
                'message' => 'Diastolik harus lebih kecil dari sistolik'],
        ];
    }

    public function fields(): array
    {
        return parent::fields() + [
            'diagnoses' => fn () => $this->diagnoses,
        ];
    }

    public function getDiagnoses()
    {
        return $this->hasMany(ExaminationDiagnosis::class, ['examination_id' => 'id'])
            ->andOnCondition(['voided_at' => null])
            ->orderBy(['diagnosis_type' => SORT_ASC, 'id' => SORT_ASC]);
    }
}

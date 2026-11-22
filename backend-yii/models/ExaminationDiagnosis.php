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
 * Diagnosis tidak pernah di-update/hapus: perubahan = void + baris baru.
 *
 * @property int $id
 * @property int $examination_id
 * @property string $icd10_code
 * @property string $diagnosis_name
 * @property string $diagnosis_type primary|secondary
 * @property string|\yii\db\Expression|null $voided_at
 * @property string|null $void_reason
 */
class ExaminationDiagnosis extends BaseModel
{
    public static function tableName(): string
    {
        return 'examination_diagnoses';
    }

    protected static function casts(): array
    {
        return ['examination_id' => 'int'];
    }

    public function rules(): array
    {
        return [
            [['icd10_code', 'diagnosis_name'], 'trim'],
            ['icd10_code', 'filter', 'filter' => 'strtoupper'],
            [['icd10_code', 'diagnosis_name', 'diagnosis_type'], 'required'],
            ['icd10_code', 'match', 'pattern' => '/^[A-Z]\d{2}(\.\d{1,2})?$/', 'message' => 'Format ICD-10 tidak valid (contoh: J06.9)'],
            ['diagnosis_name', 'string', 'max' => 255],
            ['diagnosis_type', 'in', 'range' => ['primary', 'secondary']],
        ];
    }

    public function fields(): array
    {
        return ['id', 'icd10_code', 'diagnosis_name', 'diagnosis_type', 'created_at'];
    }
}

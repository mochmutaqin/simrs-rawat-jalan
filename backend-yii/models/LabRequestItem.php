<?php

declare(strict_types=1);

namespace app\models;

/**
 * @property int $id
 * @property int $lab_request_id
 * @property int $lab_test_id
 * @property string $unit_price
 * @property string|null $result_value
 * @property string|null $result_unit
 * @property string|null $ref_range
 * @property string|null $result_flag
 * @property string|null $result_notes
 * @property int|null $resulted_by
 * @property string|\yii\db\Expression|null $resulted_at
 * @property string|\yii\db\Expression|null $voided_at
 * @property-read LabTest $labTest
 * @property-read LabRequest $request
 */
class LabRequestItem extends BaseModel
{
    public static function tableName(): string
    {
        return 'lab_request_items';
    }

    protected static function label(): string
    {
        return 'Item pemeriksaan lab';
    }

    protected static function casts(): array
    {
        return ['lab_request_id' => 'int', 'lab_test_id' => 'int', 'unit_price' => 'float', 'resulted_by' => 'int'];
    }

    public function rules(): array
    {
        return [
            [['result_value', 'result_unit', 'result_notes'], 'trim'],
            ['result_value', 'required'],
            ['result_value', 'string', 'max' => 200],
            ['result_unit', 'string', 'max' => 50],
            ['result_flag', 'in', 'range' => ['normal', 'high', 'low', 'abnormal']],
            ['result_notes', 'string', 'max' => 1000],
        ];
    }

    public function fields(): array
    {
        return parent::fields() + [
            'code' => fn () => $this->labTest->code,
            'name' => fn () => $this->labTest->name,
        ];
    }

    public function getLabTest()
    {
        return $this->hasOne(LabTest::class, ['id' => 'lab_test_id']);
    }

    public function getRequest()
    {
        return $this->hasOne(LabRequest::class, ['id' => 'lab_request_id']);
    }
}

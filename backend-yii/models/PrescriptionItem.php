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
 * @property int $prescription_id
 * @property int $medicine_id
 * @property string $dose
 * @property string $frequency
 * @property int $quantity
 * @property string $unit_price
 * @property string|null $instructions
 * @property string|\yii\db\Expression|null $voided_at
 * @property-read Medicine $medicine
 */
class PrescriptionItem extends BaseModel
{
    public static function tableName(): string
    {
        return 'prescription_items';
    }

    protected static function casts(): array
    {
        return ['prescription_id' => 'int', 'medicine_id' => 'int', 'quantity' => 'int', 'unit_price' => 'float'];
    }

    public function rules(): array
    {
        return [
            [['dose', 'frequency', 'instructions'], 'trim'],
            [['medicine_id', 'dose', 'frequency', 'quantity'], 'required'],
            ['medicine_id', 'integer'],
            ['quantity', 'integer', 'min' => 1, 'max' => 1000],
            [['dose', 'frequency'], 'string', 'max' => 100],
            ['instructions', 'string', 'max' => 500],
        ];
    }

    public function subtotal(): float
    {
        return (float) $this->unit_price * (int) $this->quantity;
    }

    public function fields(): array
    {
        return parent::fields() + [
            'medicine_code' => fn () => $this->medicine->code,
            'medicine_name' => fn () => $this->medicine->name,
            'unit' => fn () => $this->medicine->unit,
            'subtotal' => fn () => $this->subtotal(),
        ];
    }

    public function getMedicine()
    {
        return $this->hasOne(Medicine::class, ['id' => 'medicine_id']);
    }
}

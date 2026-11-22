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
 * @property int $procedure_id
 * @property int $quantity
 * @property string $unit_price snapshot tarif saat tindakan dicatat
 * @property string|null $notes
 * @property int|null $performed_by
 * @property string|\yii\db\Expression|null $voided_at
 * @property string|null $void_reason
 * @property-read Procedure $procedure
 */
class VisitProcedure extends BaseModel
{
    public static function tableName(): string
    {
        return 'visit_procedures';
    }

    protected static function label(): string
    {
        return 'Tindakan kunjungan';
    }

    protected static function casts(): array
    {
        return ['visit_id' => 'int', 'procedure_id' => 'int', 'quantity' => 'int', 'unit_price' => 'float', 'performed_by' => 'int'];
    }

    public function fields(): array
    {
        return parent::fields() + [
            'code' => fn () => $this->procedure->code,
            'name' => fn () => $this->procedure->name,
            'subtotal' => fn () => (float) $this->unit_price * (int) $this->quantity,
        ];
    }

    public function getProcedure()
    {
        return $this->hasOne(Procedure::class, ['id' => 'procedure_id']);
    }
}

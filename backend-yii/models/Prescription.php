<?php

declare(strict_types=1);

namespace app\models;

/**
 * @property int $id
 * @property int $visit_id
 * @property int $doctor_id
 * @property string $status pending|dispensed|cancelled
 * @property string|null $notes
 * @property int|null $dispensed_by
 * @property string|\yii\db\Expression|null $dispensed_at
 * @property-read PrescriptionItem[] $items
 * @property-read Visit $visit
 */
class Prescription extends BaseModel
{
    public static function tableName(): string
    {
        return 'prescriptions';
    }

    protected static function label(): string
    {
        return 'Resep';
    }

    protected static function casts(): array
    {
        return ['visit_id' => 'int', 'doctor_id' => 'int', 'dispensed_by' => 'int'];
    }

    public function fields(): array
    {
        return parent::fields() + [
            'items' => fn () => $this->items,
            'total' => fn () => array_sum(array_map(fn (PrescriptionItem $i) => $i->subtotal(), $this->items)),
        ];
    }

    public function extraFields(): array
    {
        return ['visit'];
    }

    public function getItems()
    {
        return $this->hasMany(PrescriptionItem::class, ['prescription_id' => 'id'])
            ->andOnCondition(['voided_at' => null])->orderBy('id');
    }

    public function getVisit()
    {
        return $this->hasOne(Visit::class, ['id' => 'visit_id']);
    }

    public static function lockOrFail(int $id): self
    {
        $sql = self::find()->where(['id' => $id])->createCommand()->getRawSql() . ' FOR UPDATE';
        $p = self::findBySql($sql)->one();
        if ($p === null) {
            throw \app\components\ApiException::notFound('Resep tidak ditemukan');
        }
        return $p;
    }
}

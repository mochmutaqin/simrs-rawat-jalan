<?php

declare(strict_types=1);

namespace app\models;

/**
 * @property int $id
 * @property int $visit_id
 * @property int $requested_by
 * @property string $status requested|in_progress|completed|cancelled
 * @property string|null $notes
 * @property-read LabRequestItem[] $items
 */
class LabRequest extends BaseModel
{
    public static function tableName(): string
    {
        return 'lab_requests';
    }

    protected static function label(): string
    {
        return 'Permintaan lab';
    }

    protected static function casts(): array
    {
        return ['visit_id' => 'int', 'requested_by' => 'int'];
    }

    public function fields(): array
    {
        return parent::fields() + ['items' => fn () => $this->items];
    }

    public function getItems()
    {
        return $this->hasMany(LabRequestItem::class, ['lab_request_id' => 'id'])
            ->andOnCondition(['voided_at' => null])->orderBy('id');
    }
}

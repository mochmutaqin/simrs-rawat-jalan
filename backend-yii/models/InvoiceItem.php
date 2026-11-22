<?php

declare(strict_types=1);

namespace app\models;

/**
 * @property int $id
 * @property int $invoice_id
 * @property string $item_type registration|procedure|lab|medicine
 * @property int $source_id
 * @property string $description
 * @property int $quantity
 * @property string $unit_price
 * @property string $subtotal kolom generated di database
 * @property string|\yii\db\Expression|null $voided_at
 * @property string|null $void_reason
 */
class InvoiceItem extends BaseModel
{
    public static function tableName(): string
    {
        return 'invoice_items';
    }

    protected static function casts(): array
    {
        return ['invoice_id' => 'int', 'source_id' => 'int', 'quantity' => 'int', 'unit_price' => 'float', 'subtotal' => 'float'];
    }
}

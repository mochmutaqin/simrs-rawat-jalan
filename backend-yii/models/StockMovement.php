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
 * @property int $medicine_id
 * @property string $movement_type in|dispense|adjustment|return
 * @property int $quantity bertanda: keluar negatif
 * @property int $stock_after
 * @property int|null $prescription_item_id
 * @property string|null $note
 * @property int|null $created_by
 * @property string $created_at
 */
class StockMovement extends BaseModel
{
    public static function tableName(): string
    {
        return 'stock_movements';
    }

    protected static function casts(): array
    {
        return ['medicine_id' => 'int', 'quantity' => 'int', 'stock_after' => 'int',
            'prescription_item_id' => 'int', 'created_by' => 'int'];
    }
}

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
 * Stok TIDAK diubah lewat CRUD biasa; hanya lewat StockService (ledger stock_movements),
 * supaya setiap perubahan stok punya jejak.
 *
 * @property int $id
 * @property string $code
 * @property string $name
 * @property string $unit
 * @property int $stock
 * @property int $min_stock
 * @property string $price
 * @property bool $is_active
 */
class Medicine extends BaseModel
{
    public static function tableName(): string
    {
        return 'medicines';
    }

    protected static function label(): string
    {
        return 'Obat';
    }

    protected static function casts(): array
    {
        return ['stock' => 'int', 'min_stock' => 'int', 'price' => 'float', 'is_active' => 'bool'];
    }

    public function rules(): array
    {
        return [
            [['code', 'name', 'unit'], 'trim'],
            ['code', 'filter', 'filter' => 'strtoupper'],
            [['code', 'name', 'unit', 'price'], 'required'],
            ['code', 'match', 'pattern' => '/^[A-Z0-9._-]{2,20}$/', 'message' => 'Kode 2-20 karakter huruf besar/angka'],
            ['code', 'unique', 'message' => 'Kode obat sudah dipakai'],
            [['name'], 'string', 'max' => 150],
            [['unit'], 'string', 'max' => 30],
            ['price', 'number', 'min' => 0],
            ['min_stock', 'integer', 'min' => 0],
            ['min_stock', 'default', 'value' => 0],
            ['is_active', 'boolean'],
        ];
    }

    public function fields(): array
    {
        return parent::fields() + ['low_stock' => fn () => (int) $this->stock <= (int) $this->min_stock];
    }
}

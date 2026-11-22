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
 * @property string $code
 * @property string $name
 * @property string $price
 * @property bool $is_active
 */
class Procedure extends BaseModel
{
    public static function tableName(): string
    {
        return 'procedures';
    }

    protected static function label(): string
    {
        return 'Tindakan';
    }

    protected static function casts(): array
    {
        return ['price' => 'float', 'is_active' => 'bool'];
    }

    public function rules(): array
    {
        return [
            [['code', 'name'], 'trim'],
            ['code', 'filter', 'filter' => 'strtoupper'],
            [['code', 'name', 'price'], 'required'],
            ['code', 'match', 'pattern' => '/^[A-Z0-9._-]{2,20}$/', 'message' => 'Kode 2-20 karakter huruf besar/angka'],
            ['code', 'unique', 'message' => 'Kode tindakan sudah dipakai'],
            ['name', 'string', 'max' => 150],
            ['price', 'number', 'min' => 0],
            ['is_active', 'boolean'],
        ];
    }
}

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
 * @property string $registration_fee
 * @property bool $is_active
 */
class Poli extends BaseModel
{
    public static function tableName(): string
    {
        return 'polis';
    }

    protected static function label(): string
    {
        return 'Poli';
    }

    protected static function casts(): array
    {
        return ['registration_fee' => 'float', 'is_active' => 'bool'];
    }

    public function rules(): array
    {
        return [
            [['code', 'name'], 'trim'],
            ['code', 'filter', 'filter' => 'strtoupper'],
            [['code', 'name'], 'required'],
            ['code', 'match', 'pattern' => '/^[A-Z0-9_-]{2,20}$/', 'message' => 'Kode 2-20 karakter huruf besar/angka'],
            ['code', 'unique', 'message' => 'Kode poli sudah dipakai'],
            ['name', 'string', 'max' => 100],
            ['registration_fee', 'number', 'min' => 0],
            ['registration_fee', 'default', 'value' => 0],
            ['is_active', 'boolean'],
        ];
    }
}

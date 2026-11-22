<?php

declare(strict_types=1);

namespace app\models;

/**
 * @property int $id
 * @property string $code
 * @property string $name
 * @property string $price
 * @property string|null $unit
 * @property string|null $ref_range
 * @property bool $is_active
 */
class LabTest extends BaseModel
{
    public static function tableName(): string
    {
        return 'lab_tests';
    }

    protected static function label(): string
    {
        return 'Jenis pemeriksaan lab';
    }

    protected static function casts(): array
    {
        return ['price' => 'float', 'is_active' => 'bool'];
    }

    public function rules(): array
    {
        return [
            [['code', 'name', 'unit', 'ref_range'], 'trim'],
            ['code', 'filter', 'filter' => 'strtoupper'],
            [['code', 'name', 'price'], 'required'],
            ['code', 'match', 'pattern' => '/^[A-Z0-9._-]{2,20}$/', 'message' => 'Kode 2-20 karakter huruf besar/angka'],
            ['code', 'unique', 'message' => 'Kode pemeriksaan sudah dipakai'],
            ['name', 'string', 'max' => 150],
            [['unit', 'ref_range'], 'string', 'max' => 50],
            ['price', 'number', 'min' => 0],
            ['is_active', 'boolean'],
        ];
    }
}

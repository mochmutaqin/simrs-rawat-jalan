<?php

declare(strict_types=1);

namespace app\models;

/**
 * @property int $id
 * @property int|null $user_id
 * @property string $staff_type doctor|nurse|pharmacist|lab_analyst
 * @property string|null $str_no
 * @property string $name
 * @property string|null $specialization
 * @property string|null $phone
 * @property bool $is_active
 */
class MedicalStaff extends BaseModel
{
    public const TYPES = ['doctor', 'nurse', 'pharmacist', 'lab_analyst'];

    public static function tableName(): string
    {
        return 'medical_staff';
    }

    protected static function label(): string
    {
        return 'Tenaga medis';
    }

    protected static function casts(): array
    {
        return ['user_id' => 'int', 'is_active' => 'bool'];
    }

    public function rules(): array
    {
        return [
            [['name', 'str_no', 'specialization', 'phone'], 'trim'],
            [['staff_type', 'name'], 'required'],
            ['staff_type', 'in', 'range' => self::TYPES],
            ['name', 'string', 'max' => 150],
            ['str_no', 'string', 'max' => 50],
            ['str_no', 'unique', 'message' => 'Nomor STR/SIP sudah terdaftar'],
            ['specialization', 'string', 'max' => 100],
            ['phone', 'match', 'pattern' => '/^[0-9+\-\s]{6,20}$/', 'message' => 'Nomor telepon tidak valid'],
            ['user_id', 'exist', 'targetClass' => User::class, 'targetAttribute' => 'id'],
            ['user_id', 'unique', 'message' => 'Akun ini sudah terhubung ke tenaga medis lain'],
            ['is_active', 'boolean'],
        ];
    }

    public static function findDoctor(int $id): self
    {
        $staff = self::findOne(['id' => $id, 'staff_type' => 'doctor', 'is_active' => true]);
        if ($staff === null) {
            throw \app\components\ApiException::unprocessable('INVALID_DOCTOR', 'Dokter tidak ditemukan atau nonaktif');
        }
        return $staff;
    }
}

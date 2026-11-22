<?php

declare(strict_types=1);

namespace app\models;

/**
 * @property int $id
 * @property string $medical_record_no dibuat otomatis oleh database (RM-000001)
 * @property string|null $nik
 * @property string $name
 * @property string $birth_date
 * @property string $gender L|P
 * @property string|null $address
 * @property string|null $phone
 * @property string|\yii\db\Expression|null $deleted_at
 */
class Patient extends BaseModel
{
    public static function tableName(): string
    {
        return 'patients';
    }

    protected static function label(): string
    {
        return 'Pasien';
    }

    public function rules(): array
    {
        return [
            [['nik', 'name', 'address', 'phone'], 'trim'],
            [['name', 'birth_date', 'gender'], 'required'],
            ['nik', 'match', 'pattern' => '/^\d{16}$/', 'message' => 'NIK harus 16 digit angka'],
            ['nik', 'unique', 'message' => 'NIK sudah terdaftar'],
            ['name', 'string', 'min' => 2, 'max' => 150],
            ['birth_date', 'date', 'format' => 'php:Y-m-d'],
            ['birth_date', 'compare', 'compareValue' => date('Y-m-d'), 'operator' => '<=', 'type' => 'string',
                'message' => 'Tanggal lahir tidak boleh di masa depan'],
            ['gender', 'in', 'range' => ['L', 'P'], 'message' => 'Jenis kelamin L atau P'],
            ['address', 'string', 'max' => 500],
            ['phone', 'match', 'pattern' => '/^[0-9+\-\s]{6,20}$/', 'message' => 'Nomor telepon tidak valid'],
        ];
    }

    public function fields(): array
    {
        $f = parent::fields();
        unset($f['deleted_at']);
        $f['age'] = fn () => (new \DateTime($this->birth_date))->diff(new \DateTime('today'))->y;
        return $f;
    }

    /** Kemungkinan pasien ganda: nama (tanpa beda huruf besar) + tanggal lahir sama. */
    public function findPossibleDuplicates(): array
    {
        return self::find()
            ->where(['lower(name)' => mb_strtolower((string) $this->name), 'birth_date' => $this->birth_date, 'deleted_at' => null])
            ->andFilterWhere(['not', ['id' => $this->id]])
            ->limit(5)
            ->all();
    }

    public static function findActiveOrFail(int $id): self
    {
        $p = self::findOne(['id' => $id, 'deleted_at' => null]);
        if ($p === null) {
            throw \app\components\ApiException::notFound('Pasien tidak ditemukan');
        }
        return $p;
    }
}

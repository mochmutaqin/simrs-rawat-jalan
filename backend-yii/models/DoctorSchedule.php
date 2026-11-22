<?php

declare(strict_types=1);

namespace app\models;

/**
 * @property int $id
 * @property int $doctor_id
 * @property int $poli_id
 * @property int $day_of_week ISO 1=Senin..7=Minggu
 * @property string $start_time
 * @property string $end_time
 * @property int $quota
 * @property bool $is_active
 * @property-read MedicalStaff $doctor
 * @property-read Poli $poli
 */
class DoctorSchedule extends BaseModel
{
    public const DAYS = [1 => 'Senin', 2 => 'Selasa', 3 => 'Rabu', 4 => 'Kamis', 5 => 'Jumat', 6 => 'Sabtu', 7 => 'Minggu'];

    public static function tableName(): string
    {
        return 'doctor_schedules';
    }

    protected static function label(): string
    {
        return 'Jadwal praktik';
    }

    protected static function casts(): array
    {
        return ['doctor_id' => 'int', 'poli_id' => 'int', 'day_of_week' => 'int', 'quota' => 'int', 'is_active' => 'bool'];
    }

    public function rules(): array
    {
        return [
            [['doctor_id', 'poli_id', 'day_of_week', 'start_time', 'end_time'], 'required'],
            ['doctor_id', 'exist', 'targetClass' => MedicalStaff::class, 'targetAttribute' => 'id',
                'filter' => ['staff_type' => 'doctor'], 'message' => 'Dokter tidak ditemukan'],
            ['poli_id', 'exist', 'targetClass' => Poli::class, 'targetAttribute' => 'id'],
            ['day_of_week', 'integer', 'min' => 1, 'max' => 7],
            [['start_time', 'end_time'], 'match', 'pattern' => '/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/', 'message' => 'Format jam HH:MM'],
            ['end_time', 'compare', 'compareAttribute' => 'start_time', 'operator' => '>', 'type' => 'string',
                'message' => 'Jam selesai harus setelah jam mulai'],
            ['quota', 'integer', 'min' => 1, 'max' => 500],
            ['quota', 'default', 'value' => 30],
            ['is_active', 'boolean'],
            ['is_active', 'default', 'value' => true],
            ['start_time', 'validateNoOverlap'],
        ];
    }

    /** Dokter tidak boleh punya dua jadwal aktif yang beririsan di hari yang sama. */
    public function validateNoOverlap(string $attribute): void
    {
        if ($this->hasErrors() || !$this->is_active) {
            return;
        }
        $clash = self::find()
            ->where(['doctor_id' => $this->doctor_id, 'day_of_week' => $this->day_of_week, 'is_active' => true])
            ->andWhere(['<', 'start_time', $this->end_time])
            ->andWhere(['>', 'end_time', $this->start_time])
            ->andFilterWhere(['not', ['id' => $this->id]])
            ->one();
        if ($clash !== null) {
            $this->addError($attribute, sprintf(
                'Bentrok dengan jadwal %s %s-%s',
                self::DAYS[$clash->day_of_week],
                substr($clash->start_time, 0, 5),
                substr($clash->end_time, 0, 5),
            ));
        }
    }

    public function fields(): array
    {
        return parent::fields() + [
            'day_name' => fn () => self::DAYS[(int) $this->day_of_week] ?? null,
            'doctor_name' => fn () => $this->doctor->name,
            'poli_name' => fn () => $this->poli->name,
        ];
    }

    public function getDoctor()
    {
        return $this->hasOne(MedicalStaff::class, ['id' => 'doctor_id']);
    }

    public function getPoli()
    {
        return $this->hasOne(Poli::class, ['id' => 'poli_id']);
    }
}

<?php

declare(strict_types=1);

namespace app\services;

use app\components\ApiException;
use app\components\Tx;
use app\models\DoctorSchedule;
use app\models\Patient;
use app\models\User;
use app\models\Visit;
use Yii;

/**
 * Pendaftaran kunjungan & antrean (skenario D1).
 *
 * Pencegahan duplikasi berlapis:
 *  1. Nomor antrean diambil dari queue_counters lewat INSERT ... ON CONFLICT DO UPDATE ... RETURNING.
 *     Baris counter terkunci sampai commit, sehingga pendaftaran ke dokter+tanggal yang sama
 *     diproses berurutan: tidak ada nomor kembar, cek kuota juga bebas race.
 *  2. Unique index (patient_id, poli_id, visit_date) untuk kunjungan aktif menolak pasien
 *     yang didaftarkan dua kali, walaupun dua petugas menekan "Simpan" bersamaan.
 */
final class RegistrationService
{
    public function __construct(private readonly BillingService $billing = new BillingService())
    {
    }

    public function register(array $data, User $user): Visit
    {
        $patientId = (int) ($data['patient_id'] ?? 0);
        $scheduleId = (int) ($data['schedule_id'] ?? 0);
        $visitDate = (string) ($data['visit_date'] ?? $this->today());
        $notes = isset($data['notes']) ? mb_substr(trim((string) $data['notes']), 0, 500) : null;

        $errors = [];
        if ($patientId <= 0) {
            $errors[] = ['field' => 'patient_id', 'message' => 'Pasien wajib dipilih'];
        }
        if ($scheduleId <= 0) {
            $errors[] = ['field' => 'schedule_id', 'message' => 'Jadwal dokter wajib dipilih'];
        }
        $date = \DateTimeImmutable::createFromFormat('!Y-m-d', $visitDate);
        if ($date === false || $date->format('Y-m-d') !== $visitDate) {
            $errors[] = ['field' => 'visit_date', 'message' => 'Format tanggal YYYY-MM-DD'];
        } elseif ($visitDate < $this->today() || $visitDate > $this->today('+30 days')) {
            $errors[] = ['field' => 'visit_date', 'message' => 'Tanggal kunjungan hari ini s.d. 30 hari ke depan'];
        }
        if ($errors) {
            throw new ApiException(422, 'VALIDATION_ERROR', 'Validasi data gagal', $errors);
        }

        $patient = Patient::findActiveOrFail($patientId);
        $schedule = DoctorSchedule::findOne(['id' => $scheduleId, 'is_active' => true]);
        if ($schedule === null || !$schedule->doctor->is_active || !$schedule->poli->is_active) {
            throw ApiException::unprocessable('INVALID_SCHEDULE', 'Jadwal tidak ditemukan atau nonaktif');
        }
        if ((int) $date->format('N') !== (int) $schedule->day_of_week) {
            throw ApiException::unprocessable('SCHEDULE_DAY_MISMATCH', sprintf(
                'Dokter %s tidak praktik pada %s (jadwal: %s)',
                $schedule->doctor->name,
                DoctorSchedule::DAYS[(int) $date->format('N')],
                DoctorSchedule::DAYS[(int) $schedule->day_of_week],
            ));
        }

        return Tx::run(function () use ($patient, $schedule, $visitDate, $notes, $user) {
            $existing = Visit::find()
                ->where(['patient_id' => $patient->id, 'poli_id' => $schedule->poli_id, 'visit_date' => $visitDate])
                ->andWhere(['<>', 'status', 'cancelled'])
                ->one();
            if ($existing !== null) {
                throw ApiException::conflict('DUPLICATE_VISIT', 'Pasien sudah terdaftar di poli ini pada tanggal tersebut', [
                    'visit_id' => $existing->id, 'queue_number' => $existing->queue_number,
                ]);
            }

            $queueNumber = (int) Yii::$app->db->createCommand(
                'INSERT INTO queue_counters (doctor_id, queue_date, last_number) VALUES (:d, :dt, 1)
                 ON CONFLICT (doctor_id, queue_date) DO UPDATE SET last_number = queue_counters.last_number + 1
                 RETURNING last_number',
                [':d' => $schedule->doctor_id, ':dt' => $visitDate],
            )->queryScalar();

            $used = (int) Visit::find()
                ->where(['doctor_id' => $schedule->doctor_id, 'visit_date' => $visitDate])
                ->andWhere(['<>', 'status', 'cancelled'])
                ->count();
            if ($used >= (int) $schedule->quota) {
                throw ApiException::conflict('QUOTA_FULL', sprintf('Kuota dr. %s pada %s sudah penuh (%d pasien)',
                    $schedule->doctor->name, $visitDate, $schedule->quota));
            }

            $visit = new Visit([
                'patient_id' => $patient->id,
                'poli_id' => $schedule->poli_id,
                'doctor_id' => $schedule->doctor_id,
                'schedule_id' => $schedule->id,
                'visit_date' => $visitDate,
                'queue_number' => $queueNumber,
                'status' => 'waiting',
                'registration_fee' => $schedule->poli->registration_fee,
                'notes' => $notes,
                'created_by' => $user->id,
            ]);
            $visit->saveOrFail(false);
            $this->billing->createForVisit($visit, (int) $user->id);
            return $visit;
        }, 'Pendaftaran kunjungan');
    }

    public function cancel(int $visitId, ?string $reason, User $user): Visit
    {
        $reason = BillingService::requireReason($reason);
        return Tx::run(function () use ($visitId, $reason) {
            $visit = Visit::lockOrFail($visitId);
            $visit->assertActive();
            if ($visit->status !== 'waiting') {
                throw ApiException::conflict('INVALID_STATUS', 'Hanya kunjungan berstatus menunggu yang bisa dibatalkan');
            }
            if ((float) $visit->invoice?->paid_amount > 0) {
                throw ApiException::conflict('HAS_PAYMENT', 'Kunjungan sudah ada pembayaran, lakukan refund terlebih dahulu');
            }
            $this->billing->voidAll($visit->id, 'Kunjungan dibatalkan: ' . $reason);
            $visit->status = 'cancelled';
            $visit->notes = trim(($visit->notes ? $visit->notes . "\n" : '') . 'Batal: ' . $reason);
            $visit->saveOrFail(false);
            return $visit;
        }, 'Batal kunjungan: ' . $reason);
    }

    /** Dokter memanggil pasien: waiting -> in_exam. */
    public function call(int $visitId, User $user): Visit
    {
        return Tx::run(function () use ($visitId, $user) {
            $visit = Visit::lockOrFail($visitId);
            $visit->assertActive();
            AccessGuard::assertCanTreat($visit, $user);
            if ($visit->status !== 'waiting') {
                throw ApiException::conflict('INVALID_STATUS', 'Pasien sudah dipanggil atau selesai diperiksa');
            }
            $visit->status = 'in_exam';
            $visit->saveOrFail(false);
            return $visit;
        }, 'Panggil pasien');
    }

    /** Daftar jadwal dokter yang praktik pada tanggal tertentu + sisa kuota. */
    public function availableSchedules(string $date, ?int $poliId): array
    {
        $d = \DateTimeImmutable::createFromFormat('!Y-m-d', $date);
        if ($d === false || $d->format('Y-m-d') !== $date) {
            throw ApiException::badRequest('Format tanggal YYYY-MM-DD');
        }
        $rows = (new \yii\db\Query())
            ->select([
                'schedule_id' => 's.id', 's.poli_id', 'poli_name' => 'p.name', 's.doctor_id', 'doctor_name' => 'm.name',
                'm.specialization', 's.start_time', 's.end_time', 's.quota',
                'used' => '(SELECT count(*) FROM visits v WHERE v.doctor_id = s.doctor_id AND v.visit_date = :date AND v.status <> \'cancelled\')',
            ])
            ->from(['s' => 'doctor_schedules'])
            ->innerJoin(['p' => 'polis'], 'p.id = s.poli_id AND p.is_active')
            ->innerJoin(['m' => 'medical_staff'], 'm.id = s.doctor_id AND m.is_active')
            ->where(['s.is_active' => true, 's.day_of_week' => (int) $d->format('N')])
            ->andFilterWhere(['s.poli_id' => $poliId])
            ->addParams([':date' => $date])
            ->orderBy(['p.name' => SORT_ASC, 's.start_time' => SORT_ASC])
            ->all();

        return array_map(static function (array $r): array {
            foreach (['schedule_id', 'poli_id', 'doctor_id', 'quota', 'used'] as $k) {
                $r[$k] = (int) $r[$k];
            }
            $r['remaining'] = max($r['quota'] - $r['used'], 0);
            return $r;
        }, $rows);
    }

    private function today(string $modify = 'now'): string
    {
        $tz = new \DateTimeZone((string) (getenv('APP_TIMEZONE') ?: 'Asia/Jakarta'));
        return (new \DateTimeImmutable($modify, $tz))->format('Y-m-d');
    }
}

<?php

declare(strict_types=1);

namespace app\services;

use app\models\DoctorSchedule;
use app\models\LabTest;
use app\models\MedicalStaff;
use app\models\Medicine;
use app\models\Patient;
use app\models\Poli;
use app\models\Procedure;
use app\models\Role;
use app\models\User;
use Yii;

/** Data dummy untuk demo & tes. Aman dijalankan ulang (idempoten per kode/username). */
final class SeedService
{
    public const DEMO_PASSWORD = 'password123';

    public function admin(string $username, string $password, string $fullName = 'Administrator'): User
    {
        $user = User::findByUsername($username) ?? new User(['username' => $username]);
        $user->scenario = User::SCENARIO_CREATE;
        $user->setAttributes([
            'full_name' => $fullName,
            'role_id' => Role::find()->select('id')->where(['code' => 'admin'])->scalar(),
            'is_active' => true,
        ], false);
        $user->password = $password;
        $user->saveOrFail();
        return $user;
    }

    /** @return array<string, int> jumlah data per jenis */
    public function demo(): array
    {
        $roleId = fn (string $code) => (int) Role::find()->select('id')->where(['code' => $code])->scalar();
        $users = [
            ['admin', 'Administrator', 'admin'],
            ['pendaftaran', 'Rina (Pendaftaran)', 'registration'],
            ['dokter.umum', 'dr. Andi Pratama', 'doctor'],
            ['dokter.gigi', 'drg. Sari Wulandari', 'doctor'],
            ['dokter.anak', 'dr. Budi Santoso, Sp.A', 'doctor'],
            ['farmasi', 'Dewi (Farmasi)', 'pharmacy'],
            ['lab', 'Joko (Laboratorium)', 'lab'],
            ['kasir', 'Maya (Kasir)', 'cashier'],
        ];
        $userIds = [];
        foreach ($users as [$username, $name, $role]) {
            $u = User::findByUsername($username) ?? new User(['username' => $username]);
            $u->scenario = User::SCENARIO_CREATE;
            $u->setAttributes(['full_name' => $name, 'role_id' => $roleId($role), 'is_active' => true], false);
            $u->password = self::DEMO_PASSWORD;
            $u->saveOrFail();
            $userIds[$username] = (int) $u->id;
        }

        $polis = [];
        foreach ([['UMUM', 'Poli Umum', 25000], ['GIGI', 'Poli Gigi', 30000], ['ANAK', 'Poli Anak', 35000]] as [$code, $name, $fee]) {
            $p = Poli::findOne(['code' => $code]) ?? new Poli(['code' => $code]);
            $p->setAttributes(['name' => $name, 'registration_fee' => $fee, 'is_active' => true], false);
            $p->saveOrFail();
            $polis[$code] = $p;
        }

        $doctors = [
            ['dokter.umum', 'STR-DU-0001', 'dr. Andi Pratama', 'Dokter Umum', 'UMUM'],
            ['dokter.gigi', 'STR-DG-0002', 'drg. Sari Wulandari', 'Dokter Gigi', 'GIGI'],
            ['dokter.anak', 'STR-SA-0003', 'dr. Budi Santoso, Sp.A', 'Spesialis Anak', 'ANAK'],
        ];
        foreach ($doctors as [$username, $str, $name, $spec, $poli]) {
            $d = MedicalStaff::findOne(['str_no' => $str]) ?? new MedicalStaff(['str_no' => $str]);
            $d->setAttributes(['user_id' => $userIds[$username], 'staff_type' => 'doctor', 'name' => $name,
                'specialization' => $spec, 'is_active' => true], false);
            $d->saveOrFail();
            // praktik setiap hari agar demo bisa dicoba kapan saja
            for ($day = 1; $day <= 7; $day++) {
                $s = DoctorSchedule::findOne(['doctor_id' => $d->id, 'poli_id' => $polis[$poli]->id, 'day_of_week' => $day])
                    ?? new DoctorSchedule(['doctor_id' => $d->id, 'poli_id' => $polis[$poli]->id, 'day_of_week' => $day]);
                $s->setAttributes(['start_time' => '08:00', 'end_time' => '20:00', 'quota' => 40, 'is_active' => true], false);
                $s->saveOrFail(false);
            }
        }
        foreach ([['farmasi', 'pharmacist', 'Dewi Apoteker', 'SIPA-0001'], ['lab', 'lab_analyst', 'Joko Analis', 'STR-AL-0001']] as [$u, $type, $name, $str]) {
            $s = MedicalStaff::findOne(['str_no' => $str]) ?? new MedicalStaff(['str_no' => $str]);
            $s->setAttributes(['user_id' => $userIds[$u], 'staff_type' => $type, 'name' => $name, 'is_active' => true], false);
            $s->saveOrFail();
        }

        $this->upsert(Procedure::class, [
            ['TND-001', 'Konsultasi dokter umum', 50000], ['TND-002', 'Jahit luka (per jahitan)', 25000],
            ['TND-003', 'Nebulizer', 75000], ['TND-004', 'Pencabutan gigi', 150000],
            ['TND-005', 'Tambal gigi', 200000], ['TND-006', 'Pembersihan karang gigi', 250000],
        ], fn ($m, $r) => $m->setAttributes(['name' => $r[1], 'price' => $r[2], 'is_active' => true], false));

        $this->upsert(LabTest::class, [
            ['HB', 'Hemoglobin', 40000, 'g/dL', '12-16'], ['LEUKO', 'Leukosit', 40000, 'rb/uL', '4-10'],
            ['GDS', 'Gula darah sewaktu', 30000, 'mg/dL', '<140'], ['KOL', 'Kolesterol total', 60000, 'mg/dL', '<200'],
            ['UA', 'Asam urat', 45000, 'mg/dL', '3.5-7.2'],
        ], fn ($m, $r) => $m->setAttributes(['name' => $r[1], 'price' => $r[2], 'unit' => $r[3], 'ref_range' => $r[4], 'is_active' => true], false));

        $stock = new StockService();
        foreach ([
            ['PCT500', 'Paracetamol 500 mg', 'tablet', 1000, 200, 20], ['AMX500', 'Amoxicillin 500 mg', 'kapsul', 2000, 150, 20],
            ['IBU400', 'Ibuprofen 400 mg', 'tablet', 1500, 100, 20], ['CTM4', 'Chlorpheniramine 4 mg', 'tablet', 500, 100, 20],
            ['OBH', 'OBH sirup 100 ml', 'botol', 15000, 30, 5], ['VITC', 'Vitamin C 500 mg', 'tablet', 800, 150, 20],
        ] as [$code, $name, $unit, $price, $initial, $min]) {
            $m = Medicine::findOne(['code' => $code]);
            if ($m === null) {
                $m = new Medicine(['code' => $code, 'name' => $name, 'unit' => $unit, 'price' => $price, 'min_stock' => $min, 'is_active' => true]);
                $m->saveOrFail();
                $stock->apply((int) $m->id, $initial, 'in', null, 'Stok awal (seed)', $userIds['farmasi']);
            }
        }

        foreach ([
            ['3273010101900001', 'Ahmad Fauzi', '1990-01-01', 'L', 'Jl. Dago No. 10, Bandung', '081234567801'],
            ['3273014502850002', 'Siti Nurhaliza', '1985-02-05', 'P', 'Jl. Riau No. 22, Bandung', '081234567802'],
            ['3273011203150003', 'Rafi Hidayat', '2015-03-12', 'L', 'Jl. Buah Batu No. 5, Bandung', '081234567803'],
            ['3273016607920004', 'Nina Kartika', '1992-07-26', 'P', 'Jl. Setiabudi No. 77, Bandung', '081234567804'],
            [null, 'Ujang Sukmana', '1970-11-30', 'L', 'Kp. Cibiru RT 02, Bandung', null],
        ] as [$nik, $name, $dob, $g, $addr, $phone]) {
            $exists = $nik ? Patient::findOne(['nik' => $nik]) : Patient::findOne(['name' => $name, 'birth_date' => $dob]);
            if ($exists === null) {
                (new Patient(['nik' => $nik, 'name' => $name, 'birth_date' => $dob, 'gender' => $g, 'address' => $addr, 'phone' => $phone]))->saveOrFail();
            }
        }

        $count = fn (string $t) => (int) Yii::$app->db->createCommand("SELECT count(*) FROM $t")->queryScalar();
        return array_combine(
            ['users', 'polis', 'medical_staff', 'doctor_schedules', 'procedures', 'medicines', 'lab_tests', 'patients'],
            array_map($count, ['users', 'polis', 'medical_staff', 'doctor_schedules', 'procedures', 'medicines', 'lab_tests', 'patients']),
        );
    }

    private function upsert(string $class, array $rows, callable $fill): void
    {
        foreach ($rows as $r) {
            $m = $class::findOne(['code' => $r[0]]) ?? new $class(['code' => $r[0]]);
            $fill($m, $r);
            $m->saveOrFail();
        }
    }
}

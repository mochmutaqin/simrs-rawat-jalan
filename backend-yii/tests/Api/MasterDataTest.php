<?php

/**
 * SIMRS Rawat Jalan
 *
 * @author  Mochamad Mutaqin Kurniawan <mochmutaqin@gmail.com>
 * @link    https://github.com/mochmutaqin/simrs-rawat-jalan
 */

declare(strict_types=1);

namespace app\tests\Api;

use app\tests\Support\ApiTestCase;

class MasterDataTest extends ApiTestCase
{
    public function testPoliCrudWithValidationAndDuplicatePrevention(): void
    {
        [$s, $j] = $this->api('POST', '/api/polis', 'admin', ['code' => 'mata', 'name' => 'Poli Mata', 'registration_fee' => 40000]);
        $this->assertSame(201, $s, json_encode($j));
        $this->assertSame('MATA', $j['data']['code']);              // dinormalisasi
        $id = $j['data']['id'];

        [$s, $j] = $this->api('POST', '/api/polis', 'admin', ['code' => 'MATA', 'name' => 'Duplikat']);
        $this->assertSame(422, $s);
        $this->assertSame('code', $j['error']['details'][0]['field']);

        [$s, $j] = $this->api('POST', '/api/polis', 'admin', ['code' => '', 'name' => '', 'registration_fee' => -5]);
        $this->assertSame(422, $s);
        $this->assertEqualsCanonicalizing(['code', 'name', 'registration_fee'], array_unique(array_column($j['error']['details'], 'field')));

        [$s, $j] = $this->api('PUT', "/api/polis/$id", 'admin', ['registration_fee' => 45000]);
        $this->assertSame(45000.0, $j['data']['registration_fee']);

        [$s, $j] = $this->api('GET', '/api/polis?q=mata', 'pendaftaran');
        $this->assertSame(1, $j['meta']['total']);

        [$s, $j] = $this->api('DELETE', "/api/polis/$id", 'admin');
        $this->assertFalse($j['data']['is_active']);                 // soft delete
        [, $j] = $this->api('GET', '/api/polis?is_active=true&q=mata', 'admin');
        $this->assertSame(0, $j['meta']['total']);
    }

    public function testPatientGetsMedicalRecordNumberAndNikIsValidated(): void
    {
        [$s, $j] = $this->api('POST', '/api/patients', 'pendaftaran', ['nik' => '123', 'name' => 'A', 'birth_date' => '2999-01-01', 'gender' => 'X']);
        $this->assertSame(422, $s);
        $this->assertEqualsCanonicalizing(['nik', 'name', 'birth_date', 'gender'], array_unique(array_column($j['error']['details'], 'field')));

        [$s, $j] = $this->api('POST', '/api/patients', 'pendaftaran', ['nik' => '3273010101900099', 'name' => 'Budi Baru', 'birth_date' => '1980-02-02', 'gender' => 'L']);
        $this->assertSame(201, $s, json_encode($j));
        $this->assertMatchesRegularExpression('/^RM-\d{6}$/', $j['data']['medical_record_no']);

        $this->assertError($this->api('POST', '/api/patients', 'pendaftaran',
            ['nik' => '3273010101900099', 'name' => 'Orang Lain', 'birth_date' => '1999-09-09', 'gender' => 'P']), 422, 'VALIDATION_ERROR');

        // cari berdasarkan nomor RM / NIK / nama
        foreach ([$j['data']['medical_record_no'], '3273010101900099', 'budi baru'] as $q) {
            [, $found] = $this->api('GET', '/api/patients?q=' . urlencode($q), 'pendaftaran');
            $this->assertSame(1, $found['meta']['total'], "cari: $q");
        }
    }

    public function testPossibleDuplicatePatientNeedsConfirmation(): void
    {
        $data = ['name' => 'Ujang Sukmana', 'birth_date' => '1970-11-30', 'gender' => 'L'];   // sudah ada di seed (tanpa NIK)
        [$s, $j] = $this->api('POST', '/api/patients', 'pendaftaran', $data);
        $this->assertSame(409, $s);
        $this->assertSame('POSSIBLE_DUPLICATE', $j['error']['code']);
        $this->assertNotEmpty($j['error']['details'][0]['medical_record_no']);

        [$s] = $this->api('POST', '/api/patients', 'pendaftaran', $data + ['confirm_new' => true]);
        $this->assertSame(201, $s);
    }

    public function testScheduleOverlapIsRejected(): void
    {
        $doctor = (int) $this->scalar("SELECT id FROM medical_staff WHERE str_no = 'STR-DU-0001'");
        [$s, $j] = $this->api('POST', '/api/doctor-schedules', 'admin', [
            'doctor_id' => $doctor, 'poli_id' => $this->idByCode('polis', 'ANAK'), 'day_of_week' => 1,
            'start_time' => '10:00', 'end_time' => '12:00',
        ]);
        $this->assertSame(422, $s);
        $this->assertStringContainsString('Bentrok', $j['error']['details'][0]['message']);
    }

    public function testMedicineStockOnlyChangesThroughLedger(): void
    {
        [$s, $j] = $this->api('POST', '/api/medicines', 'farmasi', ['code' => 'MTF500', 'name' => 'Metformin 500 mg', 'unit' => 'tablet', 'price' => 700, 'stock' => 50]);
        $this->assertSame(201, $s, json_encode($j));
        $id = $j['data']['id'];
        $this->assertSame(50, $j['data']['stock']);

        // stok di body update diabaikan
        [, $j] = $this->api('PUT', "/api/medicines/$id", 'farmasi', ['stock' => 9999, 'price' => 750]);
        $this->assertSame(50, $j['data']['stock']);

        [, $j] = $this->api('POST', "/api/medicines/$id/stock", 'farmasi', ['type' => 'in', 'quantity' => 25]);
        $this->assertSame(75, $j['data']['stock']);
        $this->assertError($this->api('POST', "/api/medicines/$id/stock", 'farmasi', ['type' => 'adjustment', 'quantity' => -100, 'note' => 'Barang rusak']), 409, 'INSUFFICIENT_STOCK');
        $this->assertError($this->api('POST', "/api/medicines/$id/stock", 'farmasi', ['type' => 'adjustment', 'quantity' => -5]), 422, 'VALIDATION_ERROR');

        [, $j] = $this->api('GET', "/api/medicines/$id/movements", 'farmasi');
        $this->assertSame([25, 50], array_column($j['data'], 'quantity'));
        $this->assertSame([75, 50], array_column($j['data'], 'stock_after'));
    }
}

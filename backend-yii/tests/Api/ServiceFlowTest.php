<?php

declare(strict_types=1);

namespace app\tests\Api;

use app\tests\Support\ApiTestCase;

/**
 * Alur pelayanan lengkap: pendaftaran -> pemeriksaan -> tindakan -> resep/farmasi -> lab -> billing -> lunas.
 */
class ServiceFlowTest extends ApiTestCase
{
    public function testFullOutpatientFlow(): void
    {
        // 1. pendaftaran
        $patientId = $this->newPatient('Pasien Alur Lengkap');
        [$s, $j] = $this->api('POST', '/api/visits', 'pendaftaran', ['patient_id' => $patientId, 'schedule_id' => $this->scheduleId('UMUM')]);
        $this->assertSame(201, $s, json_encode($j));
        $visitId = $j['data']['id'];
        $this->assertSame('waiting', $j['data']['status']);
        $this->assertMatchesRegularExpression('/^UMUM-\d{3}$/', $j['data']['queue_code']);
        $this->assertError($this->api('POST', '/api/visits', 'pendaftaran', ['patient_id' => $patientId, 'schedule_id' => $this->scheduleId('UMUM')]), 409, 'DUPLICATE_VISIT');

        // 2. dokter memanggil & memeriksa
        [, $q] = $this->api('GET', '/api/examinations/queue', 'dokter.umum');
        $this->assertContains($visitId, array_column($q['data'], 'id'));
        [, $j] = $this->api('POST', "/api/visits/$visitId/call", 'dokter.umum');
        $this->assertSame('in_exam', $j['data']['status']);

        [$s, $j] = $this->api('PUT', "/api/visits/$visitId/examination", 'dokter.umum', [
            'chief_complaint' => 'Demam dan batuk 3 hari', 'anamnesis' => 'Demam naik turun, batuk berdahak',
            'bp_systolic' => 120, 'bp_diastolic' => 80, 'heart_rate' => 92, 'resp_rate' => 20, 'temperature' => 38.4, 'spo2' => 98,
            'weight_kg' => 65, 'height_cm' => 170, 'physical_exam' => 'Faring hiperemis',
            'diagnoses' => [
                ['icd10_code' => 'j06.9', 'diagnosis_name' => 'ISPA', 'diagnosis_type' => 'primary'],
                ['icd10_code' => 'R50.9', 'diagnosis_name' => 'Demam', 'diagnosis_type' => 'secondary'],
            ],
        ]);
        $this->assertSame(200, $s, json_encode($j));
        $this->assertSame(['J06.9', 'R50.9'], array_column($j['data']['diagnoses'], 'icd10_code'));

        // validasi vital sign
        [$s, $j] = $this->api('PUT', "/api/visits/$visitId/examination", 'dokter.umum', ['temperature' => 60, 'bp_systolic' => 80, 'bp_diastolic' => 90]);
        $this->assertSame(422, $s);
        $this->assertEqualsCanonicalizing(['temperature', 'bp_diastolic'], array_column($j['error']['details'], 'field'));

        // 3. tindakan (lebih dari satu), tarif tampil
        $this->api('POST', "/api/visits/$visitId/procedures", 'dokter.umum', ['procedure_id' => $this->idByCode('procedures', 'TND-001')]);
        [, $j] = $this->api('POST', "/api/visits/$visitId/procedures", 'dokter.umum', ['procedure_id' => $this->idByCode('procedures', 'TND-003')]);
        $this->assertSame(75000.0, $j['data']['unit_price']);
        [, $j] = $this->api('GET', "/api/visits/$visitId/procedures", 'dokter.umum');
        $this->assertSame(125000.0, $j['meta']['total']);

        // 4. resep, validasi stok
        $pct = $this->idByCode('medicines', 'PCT500');
        $this->assertError($this->api('POST', "/api/visits/$visitId/prescriptions", 'dokter.umum', [
            'items' => [['medicine_id' => $pct, 'dose' => '500 mg', 'frequency' => '3x1', 'quantity' => 100000]],
        ]), 422, 'VALIDATION_ERROR');
        [$s, $j] = $this->api('POST', "/api/visits/$visitId/prescriptions", 'dokter.umum', ['items' => [
            ['medicine_id' => $pct, 'dose' => '500 mg', 'frequency' => '3x sehari', 'quantity' => 10],
            ['medicine_id' => $this->idByCode('medicines', 'OBH'), 'dose' => '1 sendok makan', 'frequency' => '3x sehari', 'quantity' => 1],
        ]]);
        $this->assertSame(201, $s, json_encode($j));
        $prescriptionId = $j['data']['id'];
        $this->assertSame(25000.0, $j['data']['total']);

        // 5. permintaan lab
        [$s, $j] = $this->api('POST', "/api/visits/$visitId/lab-requests", 'dokter.umum', ['test_ids' => [$this->idByCode('lab_tests', 'HB'), $this->idByCode('lab_tests', 'LEUKO')]]);
        $this->assertSame(201, $s, json_encode($j));
        $labItem = $j['data']['items'][0]['id'];

        // finalisasi wajib diagnosis utama (sudah ada)
        [, $j] = $this->api('POST', "/api/visits/$visitId/examination/finalize", 'dokter.umum');
        $this->assertSame('final', $j['data']['status']);

        // 6. farmasi menyerahkan obat -> stok berkurang
        $stockBefore = (int) $this->scalar('SELECT stock FROM medicines WHERE id = ?', [$pct]);
        [, $pending] = $this->api('GET', '/api/prescriptions?status=pending', 'farmasi');
        $this->assertContains($prescriptionId, array_column($pending['data'], 'id'));
        [, $j] = $this->api('POST', "/api/prescriptions/$prescriptionId/dispense", 'farmasi');
        $this->assertSame('dispensed', $j['data']['status']);
        $this->assertSame($stockBefore - 10, (int) $this->scalar('SELECT stock FROM medicines WHERE id = ?', [$pct]));

        // 7. hasil lab (jalur services-node -> internal Yii)
        [$s, $j] = $this->api('PUT', "/internal/lab-items/$labItem/result", null,
            ['result_value' => '13.5', 'result_flag' => 'normal', 'resulted_by' => 1],
            ['X-Service-Token' => getenv('INTERNAL_SERVICE_TOKEN') ?: 'dev-service-token', 'Idempotency-Key' => 'flow-lab-0001']);
        $this->assertSame(200, $s, json_encode($j));
        $this->assertSame('in_progress', $j['data']['request_status']);

        // rekam medis memuat semuanya
        [, $mr] = $this->api('GET', "/api/patients/$patientId/medical-records", 'dokter.umum');
        $v = $mr['data']['visits'][0];
        $this->assertSame('J06.9', $v['examination']['diagnoses'][0]['icd10_code']);
        $this->assertCount(2, $v['procedures']);
        $this->assertCount(2, $v['medications']);
        $this->assertSame('13.5', $v['lab_results'][0]['result_value']);

        // 8. billing: semua komponen tergabung otomatis
        [, $inv] = $this->api('GET', "/api/visits/$visitId/invoice", 'kasir');
        $d = $inv['data'];
        $this->assertSame(['registration' => 25000.0, 'procedure' => 125000.0, 'lab' => 80000.0, 'medicine' => 25000.0], $d['summary']);
        $this->assertSame(255000.0, $d['total_amount']);
        $this->assertSame('unpaid', $d['status']);

        // 9. bayar bertahap: tunai lalu non-tunai
        [$s, $j] = $this->api('POST', "/api/invoices/{$d['id']}/payments", 'kasir', ['amount' => 100000, 'method' => 'cash'], ['Idempotency-Key' => 'flow-pay-0001']);
        $this->assertSame(201, $s, json_encode($j));
        $this->assertSame('partial', $j['data']['invoice']['status']);
        $this->assertError($this->api('POST', "/api/invoices/{$d['id']}/payments", 'kasir', ['amount' => 999999, 'method' => 'cash'], ['Idempotency-Key' => 'flow-pay-0002']), 422, 'PAYMENT_EXCEEDS_BALANCE');
        $this->assertError($this->api('POST', "/api/invoices/{$d['id']}/payments", 'kasir', ['amount' => 1000, 'method' => 'non_cash'], ['Idempotency-Key' => 'flow-pay-0003']), 422, 'VALIDATION_ERROR');
        $this->assertError($this->api('POST', "/api/invoices/{$d['id']}/payments", 'kasir', ['amount' => 1000, 'method' => 'cash']), 400, 'BAD_REQUEST');

        [, $j] = $this->api('POST', "/api/invoices/{$d['id']}/payments", 'kasir', ['amount' => 155000, 'method' => 'non_cash', 'channel' => 'qris'], ['Idempotency-Key' => 'flow-pay-0004']);
        $this->assertSame('paid', $j['data']['invoice']['status']);
        $this->assertStringStartsWith('SIM-', $j['data']['payment']['reference_no']);
        $receiptId = $j['data']['payment']['id'];

        // kunjungan selesai, riwayat & dokumen cetak
        [, $j] = $this->api('GET', "/api/visits/$visitId", 'pendaftaran');
        $this->assertSame('completed', $j['data']['status']);
        [, $j] = $this->api('GET', "/api/patients/$patientId/payments", 'kasir');
        $this->assertSame(2, $j['meta']['total']);
        foreach (["/api/invoices/{$d['id']}/print", "/api/payments/$receiptId/receipt"] as $path) {
            $res = $this->http()->get($path, ['headers' => ['Authorization' => 'Bearer ' . $this->token('kasir')]]);
            $this->assertSame(200, $res->getStatusCode());
            $this->assertStringContainsString('text/html', $res->getHeaderLine('Content-Type'));
            $this->assertStringContainsString($d['invoice_no'], (string) $res->getBody());
        }

        // event integrasi tercatat di outbox (dikirim worker ke services-node)
        $events = $this->db()->query("SELECT event_type FROM outbox_events WHERE payload->>'visit_id' = '$visitId' ORDER BY id")->fetchAll(\PDO::FETCH_COLUMN);
        $this->assertSame(['lab.requested', 'payment.completed'], $events);
    }

    public function testCancelRegistration(): void
    {
        $visitId = $this->newVisit('Pasien Batal');
        $this->assertError($this->api('POST', "/api/visits/$visitId/cancel", 'pendaftaran', ['reason' => '']), 422, 'REASON_REQUIRED');
        [, $j] = $this->api('POST', "/api/visits/$visitId/cancel", 'pendaftaran', ['reason' => 'Pasien pulang sebelum diperiksa']);
        $this->assertSame('cancelled', $j['data']['status']);
        [, $inv] = $this->api('GET', "/api/visits/$visitId/invoice", 'kasir');
        $this->assertSame(0.0, $inv['data']['total_amount']);
        $this->assertError($this->api('PUT', "/api/visits/$visitId/examination", 'dokter.umum', ['anamnesis' => 'x']), 409, 'VISIT_CANCELLED');
    }
}

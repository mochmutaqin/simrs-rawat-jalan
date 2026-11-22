<?php

declare(strict_types=1);

namespace app\tests\Api;

use app\tests\Support\ApiTestCase;

/**
 * Skenario D1-D3 diuji dengan request yang benar-benar dikirim bersamaan.
 */
class ConcurrencyTest extends ApiTestCase
{
    /** D1: dua (sepuluh) petugas mendaftarkan pasien yang sama bersamaan. */
    public function testSamePatientRegisteredConcurrentlyOnlyOnce(): void
    {
        $patientId = $this->newPatient('Pasien Rebutan');
        $body = ['patient_id' => $patientId, 'schedule_id' => $this->scheduleId('ANAK')];
        $results = $this->parallel(array_fill(0, 10, ['POST', '/api/visits', 'pendaftaran', $body]));

        $statuses = array_count_values(array_column($results, 0));
        $this->assertSame(1, $statuses[201] ?? 0, json_encode($results));
        $this->assertSame(9, $statuses[409] ?? 0);
        foreach ($results as [$s, $j]) {
            if ($s === 409) {
                $this->assertSame('DUPLICATE_VISIT', $j['error']['code']);
            }
        }
        $this->assertSame(1, (int) $this->scalar("SELECT count(*) FROM visits WHERE patient_id = ? AND status <> 'cancelled'", [$patientId]));
    }

    /** D1: banyak pasien berbeda bersamaan -> nomor antrean unik dan berurutan tanpa celah. */
    public function testConcurrentRegistrationsGetUniqueQueueNumbers(): void
    {
        $schedule = $this->scheduleId('GIGI');
        $requests = [];
        for ($i = 0; $i < 12; $i++) {
            $requests[] = ['POST', '/api/visits', 'pendaftaran', ['patient_id' => $this->newPatient("Antre Paralel $i"), 'schedule_id' => $schedule]];
        }
        $before = (int) $this->scalar("SELECT COALESCE(max(queue_number),0) FROM visits WHERE visit_date = ? AND poli_id = ?", [$this->today(), $this->idByCode('polis', 'GIGI')]);
        $results = $this->parallel($requests);

        $numbers = array_map(fn ($r) => $r[1]['data']['queue_number'] ?? null, $results);
        $this->assertNotContains(null, $numbers, json_encode($results));
        sort($numbers);
        $this->assertSame(range($before + 1, $before + 12), $numbers);
    }

    /** D2: dua resep berebut stok yang hanya cukup untuk satu -> satu berhasil, stok tidak minus. */
    public function testConcurrentDispenseNeverMakesStockNegative(): void
    {
        [, $m] = $this->api('POST', '/api/medicines', 'farmasi', ['code' => 'LANGKA', 'name' => 'Obat Langka', 'unit' => 'ampul', 'price' => 50000, 'stock' => 5]);
        $medicineId = $m['data']['id'];

        $prescriptions = [];
        foreach (['Rebut Stok A', 'Rebut Stok B'] as $name) {
            $visitId = $this->newVisit($name);
            [$s, $p] = $this->api('POST', "/api/visits/$visitId/prescriptions", 'dokter.umum', [
                'items' => [['medicine_id' => $medicineId, 'dose' => '1 ampul', 'frequency' => '1x', 'quantity' => 2]],
            ]);
            $this->assertSame(201, $s, json_encode($p));
            $prescriptions[] = $p['data']['id'];
        }
        // stok diturunkan sehingga hanya cukup untuk satu resep (mis. sebagian rusak)
        $this->api('POST', "/api/medicines/$medicineId/stock", 'farmasi', ['type' => 'adjustment', 'quantity' => -2, 'note' => 'Ampul pecah']);

        $results = $this->parallel(array_map(fn ($id) => ['POST', "/api/prescriptions/$id/dispense", 'farmasi'], $prescriptions));
        $codes = array_map(fn ($r) => $r[0] === 200 ? 'OK' : $r[1]['error']['code'], $results);
        sort($codes);
        $this->assertSame(['INSUFFICIENT_STOCK', 'OK'], $codes, json_encode($results));
        $this->assertSame(1, (int) $this->scalar('SELECT stock FROM medicines WHERE id = ?', [$medicineId]));
        $this->assertSame(1, (int) $this->scalar("SELECT count(*) FROM stock_movements WHERE medicine_id = ? AND movement_type = 'dispense'", [$medicineId]));
    }

    /** Resep yang sama diproses dua petugas farmasi bersamaan -> obat keluar sekali. */
    public function testSamePrescriptionDispensedOnce(): void
    {
        $visitId = $this->newVisit('Resep Dobel');
        $med = $this->idByCode('medicines', 'VITC');
        [, $p] = $this->api('POST', "/api/visits/$visitId/prescriptions", 'dokter.umum', ['items' => [['medicine_id' => $med, 'dose' => '500 mg', 'frequency' => '1x', 'quantity' => 3]]]);
        $stock = (int) $this->scalar('SELECT stock FROM medicines WHERE id = ?', [$med]);

        $results = $this->parallel(array_fill(0, 5, ['POST', "/api/prescriptions/{$p['data']['id']}/dispense", 'farmasi']));
        $this->assertSame(1, count(array_filter($results, fn ($r) => $r[0] === 200)), json_encode($results));
        $this->assertSame($stock - 3, (int) $this->scalar('SELECT stock FROM medicines WHERE id = ?', [$med]));
    }

    /** D3: jaringan putus, kasir mengirim ulang pembayaran yang sama berkali-kali (bahkan bersamaan). */
    public function testRetriedPaymentIsRecordedOnce(): void
    {
        $visitId = $this->newVisit('Bayar Retry');
        [, $inv] = $this->api('GET', "/api/visits/$visitId/invoice", 'kasir');
        $invoiceId = $inv['data']['id'];
        $req = ['POST', "/api/invoices/$invoiceId/payments", 'kasir', ['amount' => 10000, 'method' => 'cash'], ['Idempotency-Key' => 'retry-pay-' . $invoiceId]];

        $results = $this->parallel(array_fill(0, 6, $req));
        $statuses = array_count_values(array_column($results, 0));
        $this->assertSame(1, $statuses[201] ?? 0, json_encode($results));
        $this->assertSame(5, $statuses[200] ?? 0);
        $ids = array_unique(array_map(fn ($r) => $r[1]['data']['payment']['id'], $results));
        $this->assertCount(1, $ids, 'semua retry mengembalikan pembayaran yang sama');
        $this->assertSame(1, (int) $this->scalar('SELECT count(*) FROM payments WHERE invoice_id = ?', [$invoiceId]));
        $this->assertSame(10000.0, (float) $this->scalar('SELECT paid_amount FROM invoices WHERE id = ?', [$invoiceId]));

        // kunci yang sama untuk nominal berbeda ditolak
        $this->assertError($this->api('POST', "/api/invoices/$invoiceId/payments", 'kasir', ['amount' => 5000, 'method' => 'cash'], ['Idempotency-Key' => 'retry-pay-' . $invoiceId]), 422, 'IDEMPOTENCY_KEY_REUSED');
    }

    /** Dua kasir melunasi tagihan yang sama bersamaan (kunci berbeda) -> tidak bisa bayar melebihi tagihan. */
    public function testConcurrentPaymentsCannotExceedInvoiceTotal(): void
    {
        $visitId = $this->newVisit('Bayar Paralel');
        [, $inv] = $this->api('GET', "/api/visits/$visitId/invoice", 'kasir');
        $total = $inv['data']['total_amount'];
        $results = $this->parallel([
            ['POST', "/api/invoices/{$inv['data']['id']}/payments", 'kasir', ['amount' => $total, 'method' => 'cash'], ['Idempotency-Key' => 'kasir-a-' . $visitId]],
            ['POST', "/api/invoices/{$inv['data']['id']}/payments", 'kasir', ['amount' => $total, 'method' => 'cash'], ['Idempotency-Key' => 'kasir-b-' . $visitId]],
        ]);
        $codes = array_map(fn ($r) => $r[0] === 201 ? 'OK' : $r[1]['error']['code'], $results);
        sort($codes);
        $this->assertSame(['OK', 'PAYMENT_EXCEEDS_BALANCE'], $codes, json_encode($results));
        $this->assertSame((float) $total, (float) $this->scalar('SELECT paid_amount FROM invoices WHERE id = ?', [$inv['data']['id']]));
    }
}

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

/** D4: dokter mengubah diagnosis/tindakan setelah billing dibuat. */
class ChangeAfterBillingTest extends ApiTestCase
{
    public function testDiagnosisChangeAfterFinalNeedsReasonAndIsTraceable(): void
    {
        $visitId = $this->newVisit('Koreksi Diagnosis');
        $this->api('PUT', "/api/visits/$visitId/examination", 'dokter.umum', [
            'anamnesis' => 'Nyeri ulu hati',
            'diagnoses' => [['icd10_code' => 'K29.7', 'diagnosis_name' => 'Gastritis', 'diagnosis_type' => 'primary']],
        ]);
        $this->assertError($this->api('POST', "/api/visits/" . $this->newVisit('Tanpa Diagnosis') . "/examination/finalize", 'dokter.umum'), 422, 'EXAM_EMPTY');
        [, $j] = $this->api('POST', "/api/visits/$visitId/examination/finalize", 'dokter.umum');
        $this->assertSame('final', $j['data']['status']);

        // setelah final: tanpa alasan ditolak
        $change = ['diagnoses' => [['icd10_code' => 'K21.9', 'diagnosis_name' => 'GERD', 'diagnosis_type' => 'primary']]];
        $this->assertError($this->api('PUT', "/api/visits/$visitId/examination", 'dokter.umum', $change), 422, 'REASON_REQUIRED');

        [$s, $j] = $this->api('PUT', "/api/visits/$visitId/examination", 'dokter.umum', $change + ['reason' => 'Hasil anamnesis lanjutan mengarah ke GERD']);
        $this->assertSame(200, $s, json_encode($j));
        $this->assertSame(['K21.9'], array_column($j['data']['diagnoses'], 'icd10_code'));
        $this->assertGreaterThan(1, $j['data']['version']);

        // diagnosis lama tidak hilang: di-void dengan alasan
        $old = $this->db()->query("SELECT void_reason FROM examination_diagnoses WHERE icd10_code = 'K29.7' AND examination_id = {$j['data']['id']}")->fetchColumn();
        $this->assertSame('Hasil anamnesis lanjutan mengarah ke GERD', $old);

        // jejak audit: siapa, kapan, alasan
        [, $h] = $this->api('GET', "/api/visits/$visitId/examination/history", 'dokter.umum');
        $reasons = array_filter(array_column($h['data'], 'reason'), fn ($r) => str_contains((string) $r, 'GERD'));
        $this->assertNotEmpty($reasons);
        $this->assertContains('dr. Andi Pratama', array_column($h['data'], 'changed_by'));
    }

    public function testProcedureVoidedAfterPaymentRevisesInvoiceAndAllowsRefund(): void
    {
        $visitId = $this->newVisit('Koreksi Tindakan');
        [, $vp] = $this->api('POST', "/api/visits/$visitId/procedures", 'dokter.umum', ['procedure_id' => $this->idByCode('procedures', 'TND-003')]);
        [, $inv] = $this->api('GET', "/api/visits/$visitId/invoice", 'kasir');
        $invoiceId = $inv['data']['id'];
        $this->assertSame(100000.0, $inv['data']['total_amount']);      // 25.000 + 75.000
        $this->api('POST', "/api/invoices/$invoiceId/payments", 'kasir', ['amount' => 100000, 'method' => 'cash'], ['Idempotency-Key' => "d4-pay-$visitId"]);

        // tindakan dibatalkan setelah lunas
        $this->assertError($this->api('DELETE', "/api/visits/$visitId/procedures/{$vp['data']['id']}", 'dokter.umum', ['reason' => '']), 422, 'REASON_REQUIRED');
        [, $j] = $this->api('DELETE', "/api/visits/$visitId/procedures/{$vp['data']['id']}", 'dokter.umum', ['reason' => 'Nebulizer tidak jadi diberikan']);
        $this->assertNotNull($j['data']['voided_at']);

        [, $inv] = $this->api('GET', "/api/invoices/$invoiceId", 'kasir');
        $d = $inv['data'];
        $this->assertSame(25000.0, $d['total_amount']);
        $this->assertSame(75000.0, $d['overpaid_amount']);
        $this->assertSame(2, $d['revision']);
        $voided = array_values(array_filter($d['items'], fn ($i) => $i['voided_at'] !== null));
        $this->assertSame('Nebulizer tidak jadi diberikan', $voided[0]['void_reason']);   // baris lama tetap terlihat

        $this->assertError($this->api('POST', "/api/invoices/$invoiceId/refunds", 'kasir',
            ['amount' => 80000, 'method' => 'cash', 'reason' => 'Refund tindakan batal'], ['Idempotency-Key' => "d4-ref-x-$visitId"]), 422, 'REFUND_EXCEEDS_OVERPAID');
        [, $r] = $this->api('POST', "/api/invoices/$invoiceId/refunds", 'kasir',
            ['amount' => 75000, 'method' => 'cash', 'reason' => 'Refund tindakan batal'], ['Idempotency-Key' => "d4-ref-$visitId"]);
        $this->assertSame('refund', $r['data']['payment']['kind']);
        $this->assertSame(['status' => 'paid', 'paid_amount' => 25000.0, 'overpaid_amount' => 0.0],
            array_intersect_key($r['data']['invoice'], array_flip(['status', 'paid_amount', 'overpaid_amount'])));
    }

    public function testProcedureAddedAfterPaymentReopensBalance(): void
    {
        $visitId = $this->newVisit('Tambah Setelah Bayar');
        [, $inv] = $this->api('GET', "/api/visits/$visitId/invoice", 'kasir');
        $this->api('POST', "/api/invoices/{$inv['data']['id']}/payments", 'kasir', ['amount' => 25000, 'method' => 'cash'], ['Idempotency-Key' => "add-pay-$visitId"]);
        $this->api('POST', "/api/visits/$visitId/procedures", 'dokter.umum', ['procedure_id' => $this->idByCode('procedures', 'TND-002'), 'quantity' => 3]);

        [, $inv] = $this->api('GET', "/api/invoices/{$inv['data']['id']}", 'kasir');
        $this->assertSame('partial', $inv['data']['status']);
        $this->assertSame(75000.0, $inv['data']['balance']);
        $this->assertSame(2, $inv['data']['revision']);
    }
}

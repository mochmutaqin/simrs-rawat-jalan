<?php

declare(strict_types=1);

namespace app\tests\Api;

use app\tests\Support\ApiTestCase;

/** D5: komunikasi dengan services-node (endpoint internal idempoten + outbox dengan retry). */
class IntegrationTest extends ApiTestCase
{
    private function internal(int $itemId, array $body, string $key): array
    {
        return $this->api('PUT', "/internal/lab-items/$itemId/result", null, $body,
            ['X-Service-Token' => getenv('INTERNAL_SERVICE_TOKEN') ?: 'dev-service-token', 'Idempotency-Key' => $key]);
    }

    private function labItems(): array
    {
        $visitId = $this->newVisit('Pasien Lab');
        [, $j] = $this->api('POST', "/api/visits/$visitId/lab-requests", 'dokter.umum',
            ['test_ids' => [$this->idByCode('lab_tests', 'GDS'), $this->idByCode('lab_tests', 'KOL')]]);
        return [$j['data']['id'], array_column($j['data']['items'], 'id')];
    }

    public function testLabResultIsIdempotentAndCompletesRequest(): void
    {
        [$requestId, [$a, $b]] = $this->labItems();

        [$s, $j] = $this->internal($a, ['result_value' => '110', 'result_flag' => 'normal', 'resulted_by' => 1], "lab-result-a-$a");
        $this->assertSame([200, false, 'in_progress'], [$s, $j['meta']['replayed'], $j['data']['request_status']]);

        // Node retry (timeout di sisi Node) dengan kunci yang sama -> tidak diproses ulang
        [$s, $j] = $this->internal($a, ['result_value' => '110', 'result_flag' => 'normal', 'resulted_by' => 1], "lab-result-a-$a");
        $this->assertSame([200, true], [$s, $j['meta']['replayed']]);

        // kunci sama untuk data berbeda ditolak
        $this->assertError($this->internal($a, ['result_value' => '999', 'resulted_by' => 1], "lab-result-a-$a"), 422, 'IDEMPOTENCY_KEY_REUSED');

        $this->internal($b, ['result_value' => '180', 'resulted_by' => 1], "lab-result-b-$b");
        $this->assertSame('completed', $this->scalar('SELECT status FROM lab_requests WHERE id = ?', [$requestId]));
        $this->assertError($this->internal($b, ['result_value' => ''], "lab-result-b2-$b"), 422, 'VALIDATION_ERROR');
        $this->assertError($this->internal(999999, ['result_value' => '1'], 'lab-missing-1'), 404, 'NOT_FOUND');
    }

    public function testCancelledLabRequestIsRemovedFromInvoice(): void
    {
        [$requestId] = $this->labItems();
        [, $j] = $this->api('POST', "/api/lab-requests/$requestId/cancel", 'dokter.umum', ['reason' => 'Pasien menolak diambil darah']);
        $this->assertSame('cancelled', $j['data']['status']);
        $visitId = (int) $this->scalar('SELECT visit_id FROM lab_requests WHERE id = ?', [$requestId]);
        [, $inv] = $this->api('GET', "/api/visits/$visitId/invoice", 'kasir');
        $this->assertSame(0.0, $inv['data']['summary']['lab']);
    }

    public function testOutboxRetriesWhenNodeIsDown(): void
    {
        $this->labItems();       // memicu event lab.requested
        $root = dirname(__DIR__, 2);
        $env = 'DB_NAME=' . (getenv('TEST_DB_NAME') ?: 'simrs_test') . ' NODE_BASE_URL=http://127.0.0.1:9 ';
        if (PHP_OS_FAMILY === 'Windows') {
            $this->markTestSkipped('Uji worker outbox memakai sintaks env shell Unix');
        }
        exec("$env" . escapeshellarg(PHP_BINARY) . " $root/yii outbox/run --once 2>&1", $out, $code);
        $this->assertSame(0, $code, implode("\n", $out));

        $row = $this->db()->query("SELECT status, attempts, last_error, next_attempt_at > now() AS later FROM outbox_events ORDER BY id DESC LIMIT 1")->fetch(\PDO::FETCH_ASSOC);
        $this->assertSame('pending', $row['status'], 'event tetap menunggu, tidak hilang');
        $this->assertGreaterThanOrEqual(1, (int) $row['attempts']);
        $this->assertNotEmpty($row['last_error']);
        $this->assertTrue((bool) $row['later'], 'percobaan berikutnya dijadwalkan dengan backoff');
    }
}

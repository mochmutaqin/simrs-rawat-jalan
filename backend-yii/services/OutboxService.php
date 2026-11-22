<?php

/**
 * SIMRS Rawat Jalan
 *
 * @author  Mochamad Mutaqin Kurniawan <mochmutaqin@gmail.com>
 * @link    https://github.com/mochmutaqin/simrs-rawat-jalan
 */

declare(strict_types=1);

namespace app\services;

use app\models\OutboxEvent;
use Yii;

/**
 * Transactional outbox (skenario D5).
 * record() dipanggil DI DALAM transaksi bisnis, jadi event dan datanya tersimpan bersama atau
 * tidak sama sekali. dispatch() (php yii outbox/run) mengirim ke services-node dengan retry +
 * exponential backoff. Node yang mati tidak menggagalkan pelayanan; event menunggu dan dikirim
 * ulang. Penerima idempoten berdasarkan id event, jadi pengiriman ganda aman.
 */
final class OutboxService
{
    public function record(string $eventType, string $aggregateType, int $aggregateId, array $payload): void
    {
        (new OutboxEvent([
            'event_type' => $eventType,
            'aggregate_type' => $aggregateType,
            'aggregate_id' => $aggregateId,
            'payload' => $payload,
        ]))->saveOrFail(false);
    }

    /**
     * @param callable(string $url, array $body, string $token): array{0:int,1:string} $send
     * @return array{sent:int, retry:int, failed:int}
     */
    public function dispatch(int $limit = 50, ?callable $send = null): array
    {
        $send ??= [$this, 'httpPost'];
        $params = Yii::$app->params;
        $max = (int) $params['outbox.maxAttempts'];
        $url = rtrim($params['node.baseUrl'], '/') . '/api/v1/integration/events';
        $stats = ['sent' => 0, 'retry' => 0, 'failed' => 0];

        $db = Yii::$app->db;
        $tx = $db->beginTransaction();
        try {
            // SKIP LOCKED: beberapa worker bisa jalan paralel tanpa mengambil event yang sama.
            $events = OutboxEvent::findBySql(
                "SELECT * FROM outbox_events WHERE status = 'pending' AND next_attempt_at <= now()
                 ORDER BY id LIMIT :lim FOR UPDATE SKIP LOCKED",
                [':lim' => $limit],
            )->all();

            foreach ($events as $ev) {
                $body = ['id' => (string) $ev->id, 'type' => $ev->event_type, 'payload' => $ev->payload];
                try {
                    [$status, $response] = $send($url, $body, (string) $params['node.serviceToken']);
                    $ok = $status >= 200 && $status < 300;
                    $error = $ok ? null : "HTTP $status: " . mb_substr($response, 0, 300);
                } catch (\Throwable $e) {
                    $ok = false;
                    $error = $e->getMessage();
                }

                $ev->attempts = (int) $ev->attempts + 1;
                if ($ok) {
                    $ev->status = 'sent';
                    $ev->processed_at = new \yii\db\Expression('now()');
                    $ev->last_error = null;
                    $stats['sent']++;
                } elseif ($ev->attempts >= $max) {
                    $ev->status = 'failed';                     // perlu ditinjau: php yii outbox/retry-failed
                    $ev->last_error = $error;
                    $stats['failed']++;
                } else {
                    $delay = min(5 * (2 ** ($ev->attempts - 1)), 3600);   // 5s, 10s, 20s, ... maks 1 jam
                    $ev->next_attempt_at = new \yii\db\Expression("now() + interval '$delay seconds'");
                    $ev->last_error = $error;
                    $stats['retry']++;
                }
                $ev->saveOrFail(false);
            }
            $tx->commit();
        } catch (\Throwable $e) {
            $tx->rollBack();
            throw $e;
        }
        return $stats;
    }

    public function retryFailed(): int
    {
        return OutboxEvent::updateAll(
            ['status' => 'pending', 'attempts' => 0, 'next_attempt_at' => new \yii\db\Expression('now()')],
            ['status' => 'failed'],
        );
    }

    /** @return array{0:int,1:string} */
    public function httpPost(string $url, array $body, string $token): array
    {
        $ctx = stream_context_create(['http' => [
            'method' => 'POST',
            'header' => "Content-Type: application/json\r\nX-Service-Token: $token\r\n",
            'content' => json_encode($body),
            'timeout' => 5,
            'ignore_errors' => true,
        ]]);
        $response = @file_get_contents($url, false, $ctx);
        if ($response === false) {
            throw new \RuntimeException('Tidak dapat terhubung ke ' . $url);
        }
        $status = 0;
        foreach ($http_response_header as $h) {
            if (preg_match('#^HTTP/\S+\s+(\d{3})#', $h, $m)) {
                $status = (int) $m[1];
            }
        }
        return [$status, $response];
    }
}

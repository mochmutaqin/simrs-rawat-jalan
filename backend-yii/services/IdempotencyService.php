<?php

/**
 * SIMRS Rawat Jalan
 *
 * @author  Mochamad Mutaqin Kurniawan <mochmutaqin@gmail.com>
 * @link    https://github.com/mochmutaqin/simrs-rawat-jalan
 */

declare(strict_types=1);

namespace app\services;

use app\components\ApiException;
use Yii;

/**
 * Menjalankan operasi tepat sekali per (scope, key).
 * Klaim kunci dengan INSERT ... ON CONFLICT DO NOTHING di transaksi yang sama dengan operasinya:
 * request kedua dengan kunci sama menunggu yang pertama commit, lalu menerima respons tersimpan.
 * Kunci sama + payload berbeda ditolak (422) agar kunci tidak disalahgunakan.
 * WAJIB dipanggil di dalam transaksi.
 */
final class IdempotencyService
{
    /**
     * @param callable(): array{0:int,1:array} $operation mengembalikan [status, response]
     * @return array{status:int, response:array, replayed:bool}
     */
    public function run(string $scope, string $key, array $request, callable $operation): array
    {
        if (!preg_match('/^[A-Za-z0-9_\-:.]{8,100}$/', $key)) {
            throw ApiException::badRequest('Idempotency-Key wajib, 8-100 karakter (huruf, angka, - _ : .)');
        }
        $hash = hash('sha256', json_encode($request));
        $db = Yii::$app->db;

        $claimed = $db->createCommand(
            "INSERT INTO idempotency_keys (scope, key, request_hash, status_code, response)
             VALUES (:s, :k, :h, 0, '{}') ON CONFLICT (scope, key) DO NOTHING",
            [':s' => $scope, ':k' => $key, ':h' => $hash],
        )->execute();

        if ($claimed === 0) {
            $row = $db->createCommand(
                'SELECT request_hash, status_code, response FROM idempotency_keys WHERE scope = :s AND key = :k',
                [':s' => $scope, ':k' => $key],
            )->queryOne();
            if ($row['request_hash'] !== $hash) {
                throw ApiException::unprocessable('IDEMPOTENCY_KEY_REUSED', 'Idempotency-Key sudah dipakai untuk data yang berbeda');
            }
            return ['status' => (int) $row['status_code'], 'response' => json_decode($row['response'], true), 'replayed' => true];
        }

        [$status, $response] = $operation();
        $db->createCommand(
            'UPDATE idempotency_keys SET status_code = :c, response = :r WHERE scope = :s AND key = :k',
            [':c' => $status, ':r' => json_encode($response), ':s' => $scope, ':k' => $key],
        )->execute();
        return ['status' => $status, 'response' => $response, 'replayed' => false];
    }
}

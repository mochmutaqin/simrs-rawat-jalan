<?php

/**
 * SIMRS Rawat Jalan
 *
 * @author  Mochamad Mutaqin Kurniawan <mochmutaqin@gmail.com>
 * @link    https://github.com/mochmutaqin/simrs-rawat-jalan
 */

declare(strict_types=1);

namespace app\components;

use Yii;
use yii\db\Exception as DbException;
use yii\web\HttpException;

/**
 * Mengubah semua exception menjadi format error JSON yang konsisten.
 * Pelanggaran constraint database (race condition yang lolos validasi aplikasi)
 * diterjemahkan menjadi 409/422 yang bisa dipahami frontend.
 */
class ApiErrorHandler extends \yii\web\ErrorHandler
{
    /** nama constraint PostgreSQL => [status, code, pesan] */
    private const CONSTRAINTS = [
        'ux_visits_no_duplicate' => [409, 'DUPLICATE_VISIT', 'Pasien sudah terdaftar di poli ini pada tanggal tersebut'],
        'ux_visits_queue' => [409, 'QUEUE_CONFLICT', 'Nomor antrean bentrok, silakan ulangi'],
        'patients_nik_key' => [409, 'DUPLICATE_NIK', 'NIK sudah terdaftar'],
        'ux_users_username' => [409, 'DUPLICATE_USERNAME', 'Username sudah dipakai'],
        'medical_staff_str_no_key' => [409, 'DUPLICATE_STR', 'Nomor STR/SIP sudah terdaftar'],
        'doctor_schedules_doctor_id_poli_id_day_of_week_start_time_key' => [409, 'DUPLICATE_SCHEDULE', 'Jadwal yang sama sudah ada'],
        'ux_stock_dispense_once' => [409, 'ALREADY_DISPENSED', 'Obat untuk item resep ini sudah diserahkan'],
        'ux_invoice_item_source' => [409, 'ALREADY_BILLED', 'Item ini sudah tercatat di tagihan'],
        'ux_exam_one_primary' => [422, 'PRIMARY_DIAGNOSIS_EXISTS', 'Hanya boleh satu diagnosis utama'],
        'ux_exam_diag_code' => [422, 'DUPLICATE_DIAGNOSIS', 'Kode ICD-10 yang sama sudah ada'],
        'medicines_stock_check' => [409, 'INSUFFICIENT_STOCK', 'Stok obat tidak mencukupi'],
        'payment_exceeds_balance' => [422, 'PAYMENT_EXCEEDS_BALANCE', null],
        'refund_exceeds_overpaid' => [422, 'REFUND_EXCEEDS_OVERPAID', null],
    ];

    private const STATUS_CODES = [
        400 => 'BAD_REQUEST', 401 => 'UNAUTHORIZED', 403 => 'FORBIDDEN', 404 => 'NOT_FOUND',
        405 => 'METHOD_NOT_ALLOWED', 409 => 'CONFLICT', 415 => 'UNSUPPORTED_MEDIA_TYPE',
        422 => 'VALIDATION_ERROR', 429 => 'TOO_MANY_REQUESTS',
    ];

    protected function renderException($exception): void
    {
        parent::renderException($this->translate($exception));
    }

    protected function convertExceptionToArray($exception): array
    {
        if ($exception instanceof ApiException) {
            $error = ['code' => $exception->errorCode, 'message' => $exception->getMessage()];
            if ($exception->details !== null) {
                $error['details'] = $exception->details;
            }
            return ['success' => false, 'error' => $error];
        }

        if ($exception instanceof HttpException) {
            return ['success' => false, 'error' => [
                'code' => self::STATUS_CODES[$exception->statusCode] ?? 'HTTP_' . $exception->statusCode,
                'message' => $exception->getMessage() ?: 'Permintaan tidak dapat diproses',
            ]];
        }

        $error = ['code' => 'INTERNAL_ERROR', 'message' => 'Terjadi kesalahan pada server'];
        if (YII_DEBUG) {
            $error['debug'] = [
                'type' => get_class($exception),
                'message' => $exception->getMessage(),
                'file' => $exception->getFile() . ':' . $exception->getLine(),
            ];
        }
        return ['success' => false, 'error' => $error];
    }

    private function translate(\Throwable $e): \Throwable
    {
        if (!$e instanceof DbException) {
            return $e;
        }
        $sqlState = $e->errorInfo[0] ?? null;
        $text = $e->getMessage();

        foreach (self::CONSTRAINTS as $name => [$status, $code, $message]) {
            if (str_contains($text, '"' . $name . '"') || str_contains($text, $name)) {
                $message ??= $this->pgMessage($text);
                return new ApiException($status, $code, $message, null, $e);
            }
        }
        if ($sqlState === '23505') {
            return ApiException::conflict('CONFLICT', 'Data yang sama sudah ada');
        }
        if ($sqlState === '23503') {
            return ApiException::conflict('REFERENCE_CONFLICT', 'Data masih dipakai atau referensi tidak valid');
        }
        if ($sqlState === '23514') {
            return ApiException::unprocessable('CONSTRAINT_VIOLATION', $this->pgMessage($text));
        }
        Yii::error($text, __METHOD__);
        return $e;
    }

    /** Ambil pesan RAISE EXCEPTION dari teks error PDO. */
    private function pgMessage(string $text): string
    {
        return preg_match('/ERROR:\s+(.+?)(\n|$)/', $text, $m) ? trim($m[1]) : 'Data tidak valid';
    }
}

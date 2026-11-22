<?php

/**
 * SIMRS Rawat Jalan
 *
 * @author  Mochamad Mutaqin Kurniawan <mochmutaqin@gmail.com>
 * @link    https://github.com/mochmutaqin/simrs-rawat-jalan
 */

declare(strict_types=1);

namespace app\components;

use yii\web\HttpException;

/**
 * Error API dengan kode mesin-readable + detail opsional.
 * Format keluaran (lihat ApiErrorHandler) sama dengan services-node:
 *   { success: false, error: { code, message, details? } }
 */
class ApiException extends HttpException
{
    public function __construct(
        int $status,
        public readonly string $errorCode,
        string $message,
        public readonly mixed $details = null,
        ?\Throwable $previous = null,
    ) {
        parent::__construct($status, $message, 0, $previous);
    }

    public static function badRequest(string $message, mixed $details = null): self
    {
        return new self(400, 'BAD_REQUEST', $message, $details);
    }

    public static function unauthorized(string $message = 'Token tidak valid atau tidak ada'): self
    {
        return new self(401, 'UNAUTHORIZED', $message);
    }

    public static function forbidden(string $message = 'Tidak memiliki hak akses'): self
    {
        return new self(403, 'FORBIDDEN', $message);
    }

    public static function notFound(string $message = 'Data tidak ditemukan'): self
    {
        return new self(404, 'NOT_FOUND', $message);
    }

    public static function conflict(string $code, string $message, mixed $details = null): self
    {
        return new self(409, $code, $message, $details);
    }

    public static function unprocessable(string $code, string $message, mixed $details = null): self
    {
        return new self(422, $code, $message, $details);
    }

    /** Error validasi dari model Yii -> [{field, message}] */
    public static function validation(\yii\base\Model $model, string $message = 'Validasi data gagal'): self
    {
        $details = [];
        foreach ($model->getErrors() as $field => $messages) {
            foreach ($messages as $m) {
                $details[] = ['field' => $field, 'message' => $m];
            }
        }
        return new self(422, 'VALIDATION_ERROR', $message, $details);
    }
}

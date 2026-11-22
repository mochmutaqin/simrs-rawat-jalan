<?php

declare(strict_types=1);

namespace app\components;

use Yii;

/**
 * Jalankan blok kode dalam satu transaksi database dan isi konteks audit
 * (app.user_id, app.change_reason) yang dibaca trigger fn_audit().
 * set_config(..., true) = SET LOCAL: hanya berlaku di transaksi ini.
 */
final class Tx
{
    /**
     * @template T
     * @param callable(): T $fn
     * @return T
     */
    public static function run(callable $fn, ?string $reason = null, ?int $userId = null): mixed
    {
        $db = Yii::$app->db;
        $tx = $db->beginTransaction();
        try {
            $userId ??= Yii::$app->has('user') && !Yii::$app->user->isGuest
                ? (int) Yii::$app->user->id
                : null;
            $db->createCommand(
                "SELECT set_config('app.user_id', :uid, true), set_config('app.change_reason', :reason, true)",
                [':uid' => $userId === null ? '' : (string) $userId, ':reason' => (string) $reason],
            )->execute();

            $result = $fn();
            $tx->commit();
            return $result;
        } catch (\Throwable $e) {
            if ($tx->isActive) {
                $tx->rollBack();
            }
            throw $e;
        }
    }
}

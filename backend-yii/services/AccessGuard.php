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
use app\models\User;
use app\models\Visit;

/** Aturan akses berbasis data (di luar permission): dokter hanya menangani pasiennya. */
final class AccessGuard
{
    public static function isAdmin(User $user): bool
    {
        return $user->role->code === 'admin';
    }

    public static function assertCanTreat(Visit $visit, User $user): void
    {
        if (self::isAdmin($user)) {
            return;
        }
        if ($user->doctorStaffId() !== (int) $visit->doctor_id) {
            throw ApiException::forbidden('Kunjungan ini bukan pasien Anda');
        }
    }

    /** Id dokter pelaku: dokter yang login, atau dokter kunjungan bila admin. */
    public static function actingDoctorId(Visit $visit, User $user): int
    {
        return self::isAdmin($user) ? (int) $visit->doctor_id : (int) $user->doctorStaffId();
    }
}

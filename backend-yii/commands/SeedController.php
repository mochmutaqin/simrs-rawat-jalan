<?php

/**
 * SIMRS Rawat Jalan
 *
 * @author  Mochamad Mutaqin Kurniawan <mochmutaqin@gmail.com>
 * @link    https://github.com/mochmutaqin/simrs-rawat-jalan
 */

declare(strict_types=1);

namespace app\commands;

use app\components\Tx;
use app\services\SeedService;
use yii\console\Controller;
use yii\console\ExitCode;
use yii\helpers\Console;

/**
 * php yii seed/admin <username> <password>  : buat/ubah akun administrator
 * php yii seed/demo                         : data dummy (user per role, poli, dokter, jadwal, obat, pasien)
 */
class SeedController extends Controller
{
    public function actionAdmin(string $username = 'admin', ?string $password = null): int
    {
        $password ??= $this->prompt('Password admin (min 8 karakter):', ['required' => true]);
        $user = Tx::run(fn () => (new SeedService())->admin($username, $password));
        $this->stdout("Admin '{$user->username}' siap.\n", Console::FG_GREEN);
        return ExitCode::OK;
    }

    public function actionDemo(): int
    {
        $counts = Tx::run(fn () => (new SeedService())->demo(), 'Seed data demo');
        foreach ($counts as $table => $n) {
            $this->stdout(str_pad($table, 18) . $n . "\n");
        }
        $this->stdout("\nAkun demo (password: " . SeedService::DEMO_PASSWORD . "):\n", Console::FG_GREEN);
        $this->stdout("  admin, pendaftaran, dokter.umum, dokter.gigi, dokter.anak, farmasi, lab, kasir\n");
        return ExitCode::OK;
    }
}

<?php

declare(strict_types=1);

namespace app\commands;

use app\services\OutboxService;
use yii\console\Controller;
use yii\console\ExitCode;

/**
 * Worker pengirim event ke services-node.
 *   php yii outbox/run          : jalan terus (polling tiap --interval detik)
 *   php yii outbox/run --once   : sekali jalan (cocok untuk cron / Task Scheduler)
 *   php yii outbox/retry-failed : jadwalkan ulang event yang gagal permanen
 *   php yii outbox/status       : ringkasan antrean
 */
class OutboxController extends Controller
{
    public bool $once = false;
    public int $interval = 5;

    public function options($actionID): array
    {
        return array_merge(parent::options($actionID), $actionID === 'run' ? ['once', 'interval'] : []);
    }

    public function actionRun(): int
    {
        $service = new OutboxService();
        $this->stdout(sprintf("Outbox worker berjalan (interval %ds). Ctrl+C untuk berhenti.\n", $this->interval));
        do {
            try {
                $s = $service->dispatch();
                if (array_sum($s) > 0) {
                    $this->stdout(sprintf("[%s] terkirim=%d dijadwalkan-ulang=%d gagal=%d\n", date('H:i:s'), $s['sent'], $s['retry'], $s['failed']));
                }
            } catch (\yii\db\Exception $e) {
                // database belum siap / putus sebentar: worker tidak mati, coba lagi di putaran berikutnya
                $this->stderr(sprintf("[%s] database tidak dapat diakses, dicoba lagi: %s\n", date('H:i:s'), strtok($e->getMessage(), "\n")));
                \Yii::$app->db->close();
                if ($this->once) {
                    return ExitCode::UNAVAILABLE;
                }
            }
            if (!$this->once) {
                sleep(max(1, $this->interval));
            }
        } while (!$this->once);
        return ExitCode::OK;
    }

    public function actionRetryFailed(): int
    {
        $this->stdout((new OutboxService())->retryFailed() . " event dijadwalkan ulang\n");
        return ExitCode::OK;
    }

    public function actionStatus(): int
    {
        $rows = \Yii::$app->db->createCommand(
            'SELECT status, count(*) AS n, min(next_attempt_at) AS next FROM outbox_events GROUP BY status ORDER BY status'
        )->queryAll();
        foreach ($rows as $r) {
            $this->stdout(sprintf("%-10s %5d  berikutnya: %s\n", $r['status'], $r['n'], $r['next']));
        }
        return ExitCode::OK;
    }
}

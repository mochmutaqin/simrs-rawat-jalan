<?php

/**
 * SIMRS Rawat Jalan
 *
 * @author  Mochamad Mutaqin Kurniawan <mochmutaqin@gmail.com>
 * @link    https://github.com/mochmutaqin/simrs-rawat-jalan
 */

declare(strict_types=1);

namespace app\controllers\api;

use app\models\DoctorSchedule;
use app\services\RegistrationService;
use Yii;
use yii\db\ActiveQuery;

class DoctorScheduleController extends CrudController
{
    protected string $modelClass = DoctorSchedule::class;
    protected array $searchable = [];
    protected array $filterable = ['doctor_id', 'poli_id', 'day_of_week'];
    protected array $sortable = ['id', 'day_of_week', 'start_time'];
    protected array $defaultOrder = ['doctor_schedules.day_of_week' => SORT_ASC, 'doctor_schedules.start_time' => SORT_ASC];
    protected array $writable = ['doctor_id', 'poli_id', 'day_of_week', 'start_time', 'end_time', 'quota', 'is_active'];

    protected function permissions(): array
    {
        return parent::permissions() + ['available' => ['registration.manage', 'queue.view']];
    }

    protected function verbs(): array
    {
        return parent::verbs() + ['available' => ['GET']];
    }

    protected function baseQuery(): ActiveQuery
    {
        return DoctorSchedule::find()->with(['doctor', 'poli']);
    }

    /** GET /api/doctor-schedules/available?date=YYYY-MM-DD&poli_id= : jadwal praktik + sisa kuota */
    public function actionAvailable(): array
    {
        $date = $this->dateParam('date', $this->today());
        $poliId = Yii::$app->request->get('poli_id');
        $rows = (new RegistrationService())->availableSchedules($date, $poliId ? (int) $poliId : null);
        return $this->ok($rows, ['date' => $date]);
    }
}

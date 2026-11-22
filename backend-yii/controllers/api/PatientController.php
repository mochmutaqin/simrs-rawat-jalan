<?php

/**
 * SIMRS Rawat Jalan
 *
 * @author  Mochamad Mutaqin Kurniawan <mochmutaqin@gmail.com>
 * @link    https://github.com/mochmutaqin/simrs-rawat-jalan
 */

declare(strict_types=1);

namespace app\controllers\api;

use app\components\ApiException;
use app\models\BaseModel;
use app\models\Patient;
use yii\db\ActiveQuery;

/**
 * Pasien. Pencarian ?q= cocok ke nomor RM, NIK, atau nama.
 * Anti duplikasi: NIK unik (validator + unique index); pasien tanpa NIK dengan nama + tanggal lahir
 * sama ditolak 409 POSSIBLE_DUPLICATE kecuali petugas mengirim confirm_new=true.
 */
class PatientController extends CrudController
{
    protected string $modelClass = Patient::class;
    protected array $searchable = ['medical_record_no', 'nik', 'name'];
    protected array $filterable = ['gender'];
    protected array $sortable = ['id', 'name', 'medical_record_no', 'birth_date'];
    protected array $defaultOrder = ['patients.id' => SORT_DESC];
    protected array $writable = ['nik', 'name', 'birth_date', 'gender', 'address', 'phone'];
    protected string $viewPermission = 'master.view';
    protected string $managePermission = 'patient.manage';

    protected function baseQuery(): ActiveQuery
    {
        return Patient::find()->where(['patients.deleted_at' => null]);
    }

    protected function beforeWrite(BaseModel $model, bool $insert): void
    {
        /** @var Patient $model */
        if (!$model->validate()) {
            throw ApiException::validation($model);
        }
        $confirmed = filter_var($this->body()['confirm_new'] ?? false, FILTER_VALIDATE_BOOLEAN);
        $dupes = $model->findPossibleDuplicates();
        if ($dupes && !$confirmed && ($insert || $model->isAttributeChanged('name') || $model->isAttributeChanged('birth_date'))) {
            throw ApiException::conflict('POSSIBLE_DUPLICATE',
                'Sudah ada pasien dengan nama dan tanggal lahir yang sama. Periksa dulu, kirim confirm_new=true bila memang pasien berbeda.',
                array_map(fn (Patient $p) => $p->toArray(['id', 'medical_record_no', 'nik', 'name', 'birth_date', 'address']), $dupes));
        }
    }

    protected function softDelete(BaseModel $model): void
    {
        $model->setAttribute('deleted_at', new \yii\db\Expression('now()'));
        $model->saveOrFail(false);
    }

    public function actionDelete(int $id): array
    {
        $hasVisit = (new \yii\db\Query())->from('visits')->where(['patient_id' => $id])->exists();
        if ($hasVisit && !$this->user()->can('user.manage')) {
            throw ApiException::conflict('HAS_HISTORY', 'Pasien sudah punya riwayat kunjungan; hanya administrator yang dapat menghapus');
        }
        return parent::actionDelete($id);
    }
}

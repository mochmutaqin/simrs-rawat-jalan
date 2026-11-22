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
use app\models\Role;
use app\models\User;
use yii\db\ActiveQuery;

class UserController extends CrudController
{
    protected string $modelClass = User::class;
    protected array $searchable = ['username', 'full_name', 'email'];
    protected array $filterable = ['role_id'];
    protected array $sortable = ['id', 'username', 'full_name'];
    protected array $defaultOrder = ['users.username' => SORT_ASC];
    protected array $writable = ['username', 'full_name', 'email', 'role_id', 'is_active', 'password'];
    protected string $viewPermission = 'user.manage';
    protected string $managePermission = 'user.manage';

    protected function permissions(): array
    {
        return parent::permissions() + ['roles' => ['user.manage']];
    }

    protected function verbs(): array
    {
        return parent::verbs() + ['roles' => ['GET']];
    }

    protected function baseQuery(): ActiveQuery
    {
        return User::find()->with('role');
    }

    protected function load(BaseModel $model, array $data): void
    {
        if (isset($data['role']) && !isset($data['role_id'])) {
            $data['role_id'] = Role::find()->select('id')->where(['code' => $data['role']])->scalar() ?: null;
        }
        /** @var User $model */
        if ($model->isNewRecord) {
            $model->scenario = User::SCENARIO_CREATE;
        }
        parent::load($model, $data);
        if (array_key_exists('password', $data)) {
            $model->password = (string) $data['password'];
        }
    }

    protected function softDelete(BaseModel $model): void
    {
        if ((int) $model->getPrimaryKey() === (int) $this->user()->id) {
            throw ApiException::conflict('SELF_DEACTIVATE', 'Tidak bisa menonaktifkan akun sendiri');
        }
        parent::softDelete($model);
    }

    /** GET /api/users/roles : daftar role + permission (untuk form user) */
    public function actionRoles(): array
    {
        $roles = Role::find()->with('permissions')->orderBy('id')->all();
        return $this->ok(array_map(
            fn (Role $r) => $r->toArray() + ['permissions' => array_map(fn ($p) => $p->code, $r->permissions)],
            $roles,
        ));
    }
}

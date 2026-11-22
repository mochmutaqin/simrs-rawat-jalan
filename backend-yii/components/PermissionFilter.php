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
use yii\base\ActionFilter;

/**
 * RBAC berbasis permission code (tabel permissions/role_permissions).
 *
 *   'rules' => ['index' => ['master.view'], 'create' => ['master.manage']]
 *
 * Action yang TIDAK terdaftar di rules ditolak (deny by default), sehingga
 * endpoint baru tidak pernah terbuka tanpa sengaja. '@' = cukup login.
 */
class PermissionFilter extends ActionFilter
{
    /** @var array<string, string[]> */
    public array $rules = [];

    public function beforeAction($action): bool
    {
        $required = $this->rules[$action->id] ?? null;
        if ($required === null) {
            throw ApiException::forbidden('Endpoint ini belum diberi aturan akses');
        }
        if ($required === ['@']) {
            return true;
        }
        /** @var \app\models\User $user */
        $user = Yii::$app->user->identity;
        foreach ($required as $code) {
            if ($user->can($code)) {
                return true;
            }
        }
        throw ApiException::forbidden('Butuh permission: ' . implode(' / ', $required));
    }
}

<?php

/**
 * SIMRS Rawat Jalan
 *
 * @author  Mochamad Mutaqin Kurniawan <mochmutaqin@gmail.com>
 * @link    https://github.com/mochmutaqin/simrs-rawat-jalan
 */

declare(strict_types=1);

namespace app\models;

/**
 * @property int $id
 * @property string $code
 * @property string $name
 * @property-read Permission[] $permissions
 */
class Role extends BaseModel
{
    public static function tableName(): string
    {
        return 'roles';
    }

    protected static function label(): string
    {
        return 'Role';
    }

    public function getPermissions()
    {
        return $this->hasMany(Permission::class, ['id' => 'permission_id'])
            ->viaTable('role_permissions', ['role_id' => 'id']);
    }
}

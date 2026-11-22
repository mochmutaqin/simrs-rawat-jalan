<?php

declare(strict_types=1);

namespace app\models;

/**
 * @property int $id
 * @property string $code
 * @property string $description
 */
class Permission extends BaseModel
{
    public static function tableName(): string
    {
        return 'permissions';
    }
}

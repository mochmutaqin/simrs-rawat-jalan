<?php

/**
 * SIMRS Rawat Jalan
 *
 * @author  Mochamad Mutaqin Kurniawan <mochmutaqin@gmail.com>
 * @link    https://github.com/mochmutaqin/simrs-rawat-jalan
 */

declare(strict_types=1);

namespace app\models;

use app\components\ApiException;
use yii\db\ActiveRecord;

/**
 * Basis semua model: helper findOrFail/saveOrFail dan casting tipe untuk JSON
 * (numeric PostgreSQL dikembalikan PDO sebagai string).
 */
abstract class BaseModel extends ActiveRecord
{
    /** @return array<string, 'int'|'float'|'bool'> */
    protected static function casts(): array
    {
        return [];
    }

    /** Label untuk pesan error. */
    protected static function label(): string
    {
        return 'Data';
    }

    public static function findOrFail(int|string|null $id): static
    {
        $model = $id === null ? null : static::findOne($id);
        if ($model === null) {
            throw ApiException::notFound(static::label() . ' tidak ditemukan');
        }
        return $model;
    }

    public function saveOrFail(bool $validate = true): static
    {
        if (!$this->save($validate)) {
            throw ApiException::validation($this);
        }
        return $this;
    }

    public function fields(): array
    {
        $fields = parent::fields();
        foreach (static::casts() as $attr => $type) {
            if (!array_key_exists($attr, $fields)) {
                continue;
            }
            $fields[$attr] = static function (self $m) use ($attr, $type) {
                $v = $m->getAttribute($attr);
                return $v === null ? null : match ($type) {
                    'int' => (int) $v,
                    'float' => (float) $v,
                    'bool' => (bool) $v,
                };
            };
        }
        return $fields;
    }

    /**
     * String kosong ('' dari form, atau hasil validator trim atas null) disimpan sebagai NULL
     * untuk kolom nullable, supaya CHECK/UNIQUE di database tidak salah tangkap.
     */
    public function beforeSave($insert): bool
    {
        $schema = static::getTableSchema();
        foreach ($this->getDirtyAttributes() as $name => $value) {
            if ($value === '' && $schema->getColumn($name)->allowNull) {
                $this->setAttribute($name, null);
            }
        }
        return parent::beforeSave($insert);
    }
}

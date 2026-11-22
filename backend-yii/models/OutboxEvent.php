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
 * @property string $aggregate_type
 * @property int $aggregate_id
 * @property string $event_type
 * @property array $payload
 * @property string $status pending|processing|sent|failed
 * @property int $attempts
 * @property string|\yii\db\Expression $next_attempt_at
 * @property string|null $last_error
 * @property string|\yii\db\Expression|null $processed_at
 */
class OutboxEvent extends BaseModel
{
    public static function tableName(): string
    {
        return 'outbox_events';
    }

    protected static function casts(): array
    {
        return ['aggregate_id' => 'int', 'attempts' => 'int'];
    }
}

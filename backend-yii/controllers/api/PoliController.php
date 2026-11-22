<?php

/**
 * SIMRS Rawat Jalan
 *
 * @author  Mochamad Mutaqin Kurniawan <mochmutaqin@gmail.com>
 * @link    https://github.com/mochmutaqin/simrs-rawat-jalan
 */

declare(strict_types=1);

namespace app\controllers\api;

use app\models\Poli;

class PoliController extends CrudController
{
    protected string $modelClass = Poli::class;
    protected array $writable = ['code', 'name', 'registration_fee', 'is_active'];
}

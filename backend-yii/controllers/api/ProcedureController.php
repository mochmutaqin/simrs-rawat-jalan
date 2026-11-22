<?php

/**
 * SIMRS Rawat Jalan
 *
 * @author  Mochamad Mutaqin Kurniawan <mochmutaqin@gmail.com>
 * @link    https://github.com/mochmutaqin/simrs-rawat-jalan
 */

declare(strict_types=1);

namespace app\controllers\api;

use app\models\Procedure;

class ProcedureController extends CrudController
{
    protected string $modelClass = Procedure::class;
    protected array $writable = ['code', 'name', 'price', 'is_active'];
    protected array $sortable = ['id', 'code', 'name', 'price'];
}

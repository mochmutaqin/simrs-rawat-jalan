<?php

declare(strict_types=1);

namespace app\controllers\api;

use app\models\LabTest;

class LabTestController extends CrudController
{
    protected string $modelClass = LabTest::class;
    protected array $writable = ['code', 'name', 'price', 'unit', 'ref_range', 'is_active'];
    protected array $sortable = ['id', 'code', 'name', 'price'];
}

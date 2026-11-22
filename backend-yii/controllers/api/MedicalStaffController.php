<?php

declare(strict_types=1);

namespace app\controllers\api;

use app\models\MedicalStaff;

class MedicalStaffController extends CrudController
{
    protected string $modelClass = MedicalStaff::class;
    protected array $searchable = ['name', 'str_no', 'specialization'];
    protected array $filterable = ['staff_type'];
    protected array $sortable = ['id', 'name', 'staff_type'];
    protected array $writable = ['user_id', 'staff_type', 'str_no', 'name', 'specialization', 'phone', 'is_active'];
}

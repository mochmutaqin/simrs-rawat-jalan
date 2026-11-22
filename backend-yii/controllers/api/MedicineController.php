<?php

declare(strict_types=1);

namespace app\controllers\api;

use app\models\BaseModel;
use app\models\Medicine;
use app\models\StockMovement;
use app\services\StockService;
use Yii;

/**
 * Obat. Stok hanya berubah lewat:
 *  - stok awal saat create (dicatat sebagai mutasi 'in'),
 *  - POST /api/medicines/{id}/stock (penerimaan / penyesuaian),
 *  - penyerahan resep.
 */
class MedicineController extends CrudController
{
    protected string $modelClass = Medicine::class;
    protected array $writable = ['code', 'name', 'unit', 'min_stock', 'price', 'is_active'];
    protected array $sortable = ['id', 'code', 'name', 'stock', 'price'];
    protected string $managePermission = 'medicine.manage';

    protected function permissions(): array
    {
        return parent::permissions() + [
            'stock' => ['medicine.manage'],
            'movements' => ['medicine.manage', 'report.view'],
        ];
    }

    protected function verbs(): array
    {
        return parent::verbs() + ['stock' => ['POST'], 'movements' => ['GET']];
    }

    public function actionIndex(): array
    {
        if (filter_var(Yii::$app->request->get('low_stock'), FILTER_VALIDATE_BOOLEAN)) {
            $query = Medicine::find()->where('stock <= min_stock')->andWhere(['is_active' => true])->orderBy('name');
            [$rows, $meta] = $this->paginate($query);
            return $this->ok($rows, $meta);
        }
        return parent::actionIndex();
    }

    protected function afterWrite(BaseModel $model, bool $insert): void
    {
        $initial = (int) ($this->body()['stock'] ?? 0);
        if ($insert && $initial > 0) {
            (new StockService())->apply((int) $model->getPrimaryKey(), $initial, 'in', null, 'Stok awal', (int) $this->user()->id);
        }
    }

    /** POST /api/medicines/{id}/stock {type: in|adjustment, quantity, note} */
    public function actionStock(int $id): array
    {
        return $this->ok((new StockService())->adjust($id, $this->body(), (int) $this->user()->id));
    }

    /** GET /api/medicines/{id}/movements : kartu stok */
    public function actionMovements(int $id): array
    {
        Medicine::findOrFail($id);
        [$rows, $meta] = $this->paginate(StockMovement::find()->where(['medicine_id' => $id])->orderBy(['id' => SORT_DESC]));
        return $this->ok($rows, $meta);
    }
}

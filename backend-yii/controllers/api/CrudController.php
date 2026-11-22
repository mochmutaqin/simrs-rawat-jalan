<?php

declare(strict_types=1);

namespace app\controllers\api;

use app\components\Tx;
use app\models\BaseModel;
use Yii;
use yii\db\ActiveQuery;

/**
 * CRUD generik untuk master data:
 *   GET    /api/{resource}?q=&<filter>=&is_active=&page=&limit=&sort=
 *   GET    /api/{resource}/{id}
 *   POST   /api/{resource}
 *   PUT    /api/{resource}/{id}
 *   DELETE /api/{resource}/{id}   (soft delete: is_active=false)
 */
abstract class CrudController extends BaseController
{
    /** @var class-string<BaseModel> */
    protected string $modelClass;
    /** kolom pencarian ILIKE untuk ?q= */
    protected array $searchable = ['code', 'name'];
    /** kolom filter persis: ?poli_id=1 */
    protected array $filterable = [];
    /** kolom yang boleh dipakai ?sort=name / ?sort=-name */
    protected array $sortable = ['id', 'code', 'name'];
    protected array $defaultOrder = ['name' => SORT_ASC];
    /** atribut yang boleh diisi dari request */
    protected array $writable = [];
    protected string $viewPermission = 'master.view';
    protected string $managePermission = 'master.manage';

    protected function permissions(): array
    {
        return [
            'index' => [$this->viewPermission],
            'view' => [$this->viewPermission],
            'create' => [$this->managePermission],
            'update' => [$this->managePermission],
            'delete' => [$this->managePermission],
        ];
    }

    protected function verbs(): array
    {
        return ['index' => ['GET'], 'view' => ['GET'], 'create' => ['POST'], 'update' => ['PUT', 'PATCH'], 'delete' => ['DELETE']];
    }

    protected function baseQuery(): ActiveQuery
    {
        return ($this->modelClass)::find();
    }

    public function actionIndex(): array
    {
        $req = Yii::$app->request;
        $table = ($this->modelClass)::tableName();
        $query = $this->baseQuery();

        if (($q = trim((string) $req->get('q', ''))) !== '') {
            $or = ['or'];
            foreach ($this->searchable as $col) {
                $or[] = ['ilike', "$table.$col", $q];
            }
            $query->andWhere($or);
        }
        foreach ($this->filterable as $col) {
            $v = $req->get($col);
            if ($v !== null && $v !== '') {
                $query->andWhere(["$table.$col" => $v]);
            }
        }
        $active = $req->get('is_active');
        if ($active !== null && $active !== '' && ($this->modelClass)::getTableSchema()->getColumn('is_active') !== null) {
            $query->andWhere(["$table.is_active" => filter_var($active, FILTER_VALIDATE_BOOLEAN)]);
        }
        $query->orderBy($this->sortOrder((string) $req->get('sort', '')) + ["$table.id" => SORT_ASC]);

        [$rows, $meta] = $this->paginate($query);
        return $this->ok($rows, $meta);
    }

    public function actionView(int $id): array
    {
        return $this->ok($this->find($id));
    }

    public function actionCreate(): array
    {
        /** @var BaseModel $model */
        $model = new $this->modelClass();
        $this->load($model, $this->body());
        $model = Tx::run(function () use ($model) {
            $this->beforeWrite($model, true);
            $model->saveOrFail();
            $this->afterWrite($model, true);
            return $model;
        }, 'Tambah ' . ($this->modelClass)::tableName());
        $model->refresh();
        return $this->created($model);
    }

    public function actionUpdate(int $id): array
    {
        $model = $this->find($id);
        $this->load($model, $this->body());
        Tx::run(function () use ($model) {
            $this->beforeWrite($model, false);
            $model->saveOrFail();
            $this->afterWrite($model, false);
        }, 'Ubah ' . ($this->modelClass)::tableName());
        $model->refresh();
        return $this->ok($model);
    }

    /** Master data tidak dihapus fisik: riwayat transaksi tetap merujuk ke data lama. */
    public function actionDelete(int $id): array
    {
        $model = $this->find($id);
        Tx::run(function () use ($model) {
            $this->softDelete($model);
        }, 'Nonaktifkan ' . ($this->modelClass)::tableName());
        $model->refresh();
        return $this->ok($model);
    }

    protected function find(int $id): BaseModel
    {
        $model = $this->baseQuery()->andWhere([($this->modelClass)::tableName() . '.id' => $id])->one();
        if (!$model instanceof BaseModel) {
            return ($this->modelClass)::findOrFail(null);    // melempar 404
        }
        return $model;
    }

    protected function load(BaseModel $model, array $data): void
    {
        $model->setAttributes(array_intersect_key($data, array_flip($this->writable)), false);
    }

    protected function softDelete(BaseModel $model): void
    {
        $model->setAttribute('is_active', false);
        $model->saveOrFail(false);
    }

    protected function beforeWrite(BaseModel $model, bool $insert): void
    {
    }

    protected function afterWrite(BaseModel $model, bool $insert): void
    {
    }

    private function sortOrder(string $sort): array
    {
        if ($sort === '') {
            return $this->defaultOrder;
        }
        $desc = str_starts_with($sort, '-');
        $col = ltrim($sort, '-');
        if (!in_array($col, $this->sortable, true)) {
            return $this->defaultOrder;
        }
        return [($this->modelClass)::tableName() . '.' . $col => $desc ? SORT_DESC : SORT_ASC];
    }
}

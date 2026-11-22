<?php

/**
 * SIMRS Rawat Jalan
 *
 * @author  Mochamad Mutaqin Kurniawan <mochmutaqin@gmail.com>
 * @link    https://github.com/mochmutaqin/simrs-rawat-jalan
 */

declare(strict_types=1);

namespace app\controllers\api;

use app\components\ApiException;
use app\components\JwtAuth;
use app\components\PermissionFilter;
use app\models\User;
use Yii;
use yii\db\ActiveQuery;
use yii\filters\ContentNegotiator;
use yii\filters\Cors;
use yii\filters\VerbFilter;
use yii\helpers\ArrayHelper;
use yii\web\Response;

/**
 * Basis semua controller API:
 *   CORS -> JSON -> autentikasi JWT -> RBAC (deny by default) -> action.
 * Response sukses: { success: true, data, meta? } (sama dengan services-node).
 */
abstract class BaseController extends \yii\rest\Controller
{
    public $enableCsrfValidation = false;

    /** @return array<string, string[]> action => permission codes ('@' = cukup login) */
    abstract protected function permissions(): array;

    /** Action tanpa login (mis. login). */
    protected function publicActions(): array
    {
        return [];
    }

    public function behaviors(): array
    {
        $public = $this->publicActions();
        return [
            'cors' => [
                'class' => Cors::class,
                'cors' => [
                    'Origin' => Yii::$app->params['cors.origins'],
                    'Access-Control-Request-Method' => ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
                    'Access-Control-Request-Headers' => ['Authorization', 'Content-Type', 'Idempotency-Key'],
                    'Access-Control-Max-Age' => 86400,
                ],
            ],
            'contentNegotiator' => [
                'class' => ContentNegotiator::class,
                'formats' => ['application/json' => Response::FORMAT_JSON],
            ],
            'authenticator' => [
                'class' => JwtAuth::class,
                'except' => $public,
            ],
            'verbFilter' => [
                'class' => VerbFilter::class,
                'actions' => $this->verbs(),
            ],
            'access' => [
                'class' => PermissionFilter::class,
                'rules' => $this->permissions() + array_fill_keys($public, ['@']),
                'except' => $public,
            ],
        ];
    }

    protected function user(): User
    {
        /** @var User $u */
        $u = Yii::$app->user->identity;
        return $u;
    }

    protected function body(): array
    {
        $body = Yii::$app->request->getBodyParams();
        return is_array($body) ? $body : [];
    }

    protected function ok(mixed $data, ?array $meta = null, int $status = 200): array
    {
        Yii::$app->response->statusCode = $status;
        $out = ['success' => true, 'data' => ArrayHelper::toArray($data)];
        if ($meta !== null) {
            $out['meta'] = $meta;
        }
        return $out;
    }

    protected function created(mixed $data, ?array $meta = null): array
    {
        return $this->ok($data, $meta, 201);
    }

    /** Paginasi ?page=&limit= (limit maks 100). @return array{0: array, 1: array} */
    protected function paginate(ActiveQuery|\yii\db\Query $query): array
    {
        $req = Yii::$app->request;
        $page = max(1, (int) $req->get('page', 1));
        $limit = min(100, max(1, (int) $req->get('limit', 20)));
        $total = (int) (clone $query)->limit(-1)->offset(-1)->orderBy([])->count();
        $rows = $query->limit($limit)->offset(($page - 1) * $limit)->all();
        return [$rows, ['page' => $page, 'limit' => $limit, 'total' => $total, 'total_pages' => (int) ceil($total / $limit)]];
    }

    protected function dateParam(string $name, ?string $default = null): ?string
    {
        $v = Yii::$app->request->get($name, $default);
        if ($v === null || $v === '') {
            return $default;
        }
        $d = \DateTimeImmutable::createFromFormat('!Y-m-d', (string) $v);
        if ($d === false || $d->format('Y-m-d') !== $v) {
            throw ApiException::badRequest("Parameter $name harus berformat YYYY-MM-DD");
        }
        return $v;
    }

    protected function today(): string
    {
        return (new \DateTimeImmutable('now', new \DateTimeZone((string) (getenv('APP_TIMEZONE') ?: 'Asia/Jakarta'))))->format('Y-m-d');
    }
}

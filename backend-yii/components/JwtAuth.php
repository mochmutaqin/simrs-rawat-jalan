<?php

/**
 * SIMRS Rawat Jalan
 *
 * @author  Mochamad Mutaqin Kurniawan <mochmutaqin@gmail.com>
 * @link    https://github.com/mochmutaqin/simrs-rawat-jalan
 */

declare(strict_types=1);

namespace app\components;

use app\models\User;
use yii\filters\auth\AuthMethod;

/** Autentikasi stateless: Authorization: Bearer <JWT>. */
class JwtAuth extends AuthMethod
{
    public function authenticate($user, $request, $response)
    {
        $header = (string) $request->getHeaders()->get('Authorization');
        if (!preg_match('/^Bearer\s+(\S+)$/i', $header, $m)) {
            return null;                              // -> handleFailure (401)
        }
        $payload = Jwt::fromParams()->verify($m[1]);
        $identity = User::findActive((int) $payload['sub']);
        if ($identity === null) {
            throw ApiException::unauthorized('Akun tidak ditemukan atau nonaktif');
        }
        $user->setIdentity($identity);
        return $identity;
    }

    public function handleFailure($response)
    {
        throw ApiException::unauthorized();
    }
}

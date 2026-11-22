<?php

declare(strict_types=1);

namespace app\controllers\api;

use app\components\ApiException;
use app\components\Jwt;
use app\models\User;

class AuthController extends BaseController
{
    protected function permissions(): array
    {
        return ['me' => ['@'], 'change-password' => ['@']];
    }

    protected function publicActions(): array
    {
        return ['login'];
    }

    protected function verbs(): array
    {
        return ['login' => ['POST'], 'me' => ['GET'], 'change-password' => ['POST']];
    }

    /** POST /api/auth/login {username, password} */
    public function actionLogin(): array
    {
        $body = $this->body();
        $username = trim((string) ($body['username'] ?? ''));
        $password = (string) ($body['password'] ?? '');
        if ($username === '' || $password === '') {
            throw new ApiException(422, 'VALIDATION_ERROR', 'Username dan password wajib diisi', [
                ...($username === '' ? [['field' => 'username', 'message' => 'Wajib diisi']] : []),
                ...($password === '' ? [['field' => 'password', 'message' => 'Wajib diisi']] : []),
            ]);
        }

        $user = User::findByUsername($username);
        // pesan sama untuk user tidak ada / password salah: tidak membocorkan username yang valid
        if ($user === null || !$user->validatePassword($password)) {
            throw new ApiException(401, 'INVALID_CREDENTIALS', 'Username atau password salah');
        }
        if (!$user->is_active) {
            throw new ApiException(403, 'ACCOUNT_INACTIVE', 'Akun dinonaktifkan, hubungi administrator');
        }

        $user->updateAttributes(['last_login_at' => new \yii\db\Expression('now()')]);
        $perms = $user->permissionCodes();
        $issued = Jwt::fromParams()->issue([
            'sub' => (int) $user->id,
            'username' => $user->username,
            'role' => $user->role->code,
            'perms' => $perms,
        ]);

        return $this->ok([
            'token' => $issued['token'],
            'token_type' => 'Bearer',
            'expires_at' => date(DATE_ATOM, $issued['expires_at']),
            'user' => $this->profile($user),
        ]);
    }

    /** GET /api/auth/me */
    public function actionMe(): array
    {
        return $this->ok($this->profile($this->user()));
    }

    /** POST /api/auth/change-password {current_password, new_password} */
    public function actionChangePassword(): array
    {
        $body = $this->body();
        $user = $this->user();
        if (!$user->validatePassword((string) ($body['current_password'] ?? ''))) {
            throw new ApiException(422, 'VALIDATION_ERROR', 'Password lama salah', [['field' => 'current_password', 'message' => 'Password lama salah']]);
        }
        $user->password = (string) ($body['new_password'] ?? '');
        if (!$user->validate(['password']) || mb_strlen($user->password) < 8) {
            throw new ApiException(422, 'VALIDATION_ERROR', 'Password baru minimal 8 karakter', [['field' => 'new_password', 'message' => 'Minimal 8 karakter']]);
        }
        $user->saveOrFail(false);
        return $this->ok(['changed' => true]);
    }

    private function profile(User $user): array
    {
        return [
            'id' => (int) $user->id,
            'username' => $user->username,
            'full_name' => $user->full_name,
            'role' => $user->role->code,
            'role_name' => $user->role->name,
            'permissions' => $user->permissionCodes(),
            'medical_staff_id' => $user->medicalStaff?->id ? (int) $user->medicalStaff->id : null,
        ];
    }
}

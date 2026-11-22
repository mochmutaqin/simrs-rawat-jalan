<?php

declare(strict_types=1);

namespace app\tests\Api;

use app\components\Jwt;
use app\tests\Support\ApiTestCase;

class AuthTest extends ApiTestCase
{
    public function testLoginReturnsTokenWithRoleAndPermissions(): void
    {
        [$s, $j] = $this->api('POST', '/api/auth/login', null, ['username' => 'kasir', 'password' => self::PASSWORD]);
        $this->assertSame(200, $s);
        $this->assertSame('Bearer', $j['data']['token_type']);
        $this->assertSame('cashier', $j['data']['user']['role']);
        $this->assertContains('payment.create', $j['data']['user']['permissions']);
        $this->assertNotContains('exam.manage', $j['data']['user']['permissions']);

        // token bisa diverifikasi dengan secret bersama (yang juga dipakai services-node)
        $payload = (new Jwt((string) (getenv('JWT_SECRET') ?: 'dev-secret-ganti-di-produksi')))->verify($j['data']['token']);
        $this->assertSame('cashier', $payload['role']);
        $this->assertContains('report.view', $payload['perms']);
    }

    public function testUsernameIsCaseInsensitive(): void
    {
        [$s] = $this->api('POST', '/api/auth/login', null, ['username' => 'KASIR', 'password' => self::PASSWORD]);
        $this->assertSame(200, $s);
    }

    public function testWrongPasswordAndUnknownUserGiveSameError(): void
    {
        $this->assertError($this->api('POST', '/api/auth/login', null, ['username' => 'kasir', 'password' => 'salah123']), 401, 'INVALID_CREDENTIALS');
        $this->assertError($this->api('POST', '/api/auth/login', null, ['username' => 'tidakada', 'password' => 'salah123']), 401, 'INVALID_CREDENTIALS');
    }

    public function testLoginValidation(): void
    {
        [$s, $j] = $this->api('POST', '/api/auth/login', null, ['username' => '']);
        $this->assertSame(422, $s);
        $this->assertSame(['username', 'password'], array_column($j['error']['details'], 'field'));
    }

    public function testProtectedEndpointWithoutOrWithBadToken(): void
    {
        $this->assertError($this->api('GET', '/api/auth/me', null), 401, 'UNAUTHORIZED');
        $this->assertError($this->api('GET', '/api/auth/me', null, null, ['Authorization' => 'Bearer abc.def.ghi']), 401, 'UNAUTHORIZED');
    }

    public function testMe(): void
    {
        [$s, $j] = $this->api('GET', '/api/auth/me', 'dokter.umum');
        $this->assertSame(200, $s);
        $this->assertSame('doctor', $j['data']['role']);
        $this->assertNotNull($j['data']['medical_staff_id']);
    }

    public function testDeactivatedUserCannotLoginOrUseOldToken(): void
    {
        [, $created] = $this->api('POST', '/api/users', 'admin', [
            'username' => 'temp.user', 'full_name' => 'Temp', 'password' => 'rahasia123', 'role' => 'cashier',
        ]);
        $id = $created['data']['id'];
        [, $login] = $this->api('POST', '/api/auth/login', null, ['username' => 'temp.user', 'password' => 'rahasia123']);
        $oldToken = $login['data']['token'];

        $this->api('DELETE', "/api/users/$id", 'admin');

        $this->assertError($this->api('POST', '/api/auth/login', null, ['username' => 'temp.user', 'password' => 'rahasia123']), 403, 'ACCOUNT_INACTIVE');
        $this->assertError($this->api('GET', '/api/auth/me', null, null, ['Authorization' => "Bearer $oldToken"]), 401, 'UNAUTHORIZED');
    }
}

<?php

/**
 * SIMRS Rawat Jalan
 *
 * @author  Mochamad Mutaqin Kurniawan <mochmutaqin@gmail.com>
 * @link    https://github.com/mochmutaqin/simrs-rawat-jalan
 */

declare(strict_types=1);

namespace app\tests\Unit;

use app\components\ApiException;
use app\components\Jwt;

class JwtTest extends \Codeception\Test\Unit
{
    private const SECRET = 'unit-test-secret-1234567890';

    public function testIssueAndVerifyRoundTrip(): void
    {
        $jwt = new Jwt(self::SECRET, 60);
        $issued = $jwt->issue(['sub' => 5, 'role' => 'cashier', 'perms' => ['billing.view']]);
        $payload = $jwt->verify($issued['token']);
        $this->assertSame(5, $payload['sub']);
        $this->assertSame(['billing.view'], $payload['perms']);
        $this->assertSame('simrs-yii', $payload['iss']);
    }

    public function testTamperedPayloadIsRejected(): void
    {
        $jwt = new Jwt(self::SECRET);
        [$h, , $s] = explode('.', $jwt->issue(['sub' => 5, 'role' => 'cashier'])['token']);
        $forged = rtrim(strtr(base64_encode(json_encode(['sub' => 1, 'role' => 'admin', 'exp' => time() + 999])), '+/', '-_'), '=');
        $this->expectUnauthorized(fn () => $jwt->verify("$h.$forged.$s"));
    }

    public function testWrongSecretIsRejected(): void
    {
        $token = (new Jwt('another-secret-0987654321'))->issue(['sub' => 1])['token'];
        $this->expectUnauthorized(fn () => (new Jwt(self::SECRET))->verify($token));
    }

    public function testAlgNoneIsRejected(): void
    {
        $b64 = fn ($a) => rtrim(strtr(base64_encode(json_encode($a)), '+/', '-_'), '=');
        $token = $b64(['alg' => 'none', 'typ' => 'JWT']) . '.' . $b64(['sub' => 1, 'exp' => time() + 60]) . '.';
        $this->expectUnauthorized(fn () => (new Jwt(self::SECRET))->verify($token));
    }

    public function testExpiredTokenIsRejectedWithClearMessage(): void
    {
        $token = (new Jwt(self::SECRET, -10))->issue(['sub' => 1])['token'];
        try {
            (new Jwt(self::SECRET))->verify($token);
            $this->fail('Token kedaluwarsa seharusnya ditolak');
        } catch (ApiException $e) {
            $this->assertSame(401, $e->statusCode);
            $this->assertSame('Token kedaluwarsa', $e->getMessage());
        }
    }

    public function testShortSecretIsRefused(): void
    {
        $this->expectException(\InvalidArgumentException::class);
        new Jwt('short');
    }

    private function expectUnauthorized(callable $fn): void
    {
        try {
            $fn();
            $this->fail('Seharusnya ditolak');
        } catch (ApiException $e) {
            $this->assertSame(401, $e->statusCode);
            $this->assertSame('UNAUTHORIZED', $e->errorCode);
        }
    }
}

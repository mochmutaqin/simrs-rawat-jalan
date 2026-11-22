<?php

declare(strict_types=1);

namespace app\components;

/**
 * JWT HS256 minimal (RFC 7519) agar tidak menambah dependency composer.
 * Diverifikasi juga oleh services-node (jsonwebtoken) dengan secret yang sama.
 */
final class Jwt
{
    public function __construct(
        private readonly string $secret,
        private readonly int $ttl = 3600,
        private readonly string $issuer = 'simrs-yii',
    ) {
        if (strlen($secret) < 16) {
            throw new \InvalidArgumentException('JWT secret minimal 16 karakter');
        }
    }

    public static function fromParams(): self
    {
        $p = \Yii::$app->params;
        return new self($p['jwt.secret'], (int) $p['jwt.ttl'], $p['jwt.issuer']);
    }

    /** @return array{token: string, expires_at: int} */
    public function issue(array $claims): array
    {
        $now = time();
        $payload = $claims + ['iss' => $this->issuer, 'iat' => $now, 'exp' => $now + $this->ttl];
        $segments = [
            self::b64(json_encode(['alg' => 'HS256', 'typ' => 'JWT'])),
            self::b64(json_encode($payload, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE)),
        ];
        $segments[] = self::b64(hash_hmac('sha256', implode('.', $segments), $this->secret, true));
        return ['token' => implode('.', $segments), 'expires_at' => $payload['exp']];
    }

    /**
     * @throws ApiException 401 bila format, tanda tangan, atau masa berlaku tidak valid
     */
    public function verify(string $token): array
    {
        $parts = explode('.', $token);
        if (count($parts) !== 3) {
            throw ApiException::unauthorized();
        }
        [$h, $p, $s] = $parts;
        $header = json_decode(self::unb64($h), true);
        if (($header['alg'] ?? null) !== 'HS256') {
            throw ApiException::unauthorized();      // tolak alg=none / RS256 dsb.
        }
        $expected = self::b64(hash_hmac('sha256', "$h.$p", $this->secret, true));
        if (!hash_equals($expected, $s)) {
            throw ApiException::unauthorized();
        }
        $payload = json_decode(self::unb64($p), true);
        if (!is_array($payload) || !isset($payload['sub'], $payload['exp'])) {
            throw ApiException::unauthorized();
        }
        if ((int) $payload['exp'] < time()) {
            throw ApiException::unauthorized('Token kedaluwarsa');
        }
        return $payload;
    }

    private static function b64(string $data): string
    {
        return rtrim(strtr(base64_encode($data), '+/', '-_'), '=');
    }

    private static function unb64(string $data): string
    {
        return (string) base64_decode(strtr($data, '-_', '+/'), true);
    }
}

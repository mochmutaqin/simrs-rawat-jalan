<?php

/**
 * SIMRS Rawat Jalan
 *
 * @author  Mochamad Mutaqin Kurniawan <mochmutaqin@gmail.com>
 * @link    https://github.com/mochmutaqin/simrs-rawat-jalan
 */

declare(strict_types=1);

namespace app\tests\Support;

use GuzzleHttp\Client;
use GuzzleHttp\Promise\Utils;
use Psr\Http\Message\ResponseInterface;

/** Basis integration test: klien HTTP, login per role, dan helper data. */
abstract class ApiTestCase extends \Codeception\Test\Unit
{
    public const PASSWORD = 'password123';

    private static array $tokens = [];
    private static ?Client $client = null;

    protected function http(): Client
    {
        return self::$client ??= new Client([
            'base_uri' => TestEnvironment::$baseUrl,
            'http_errors' => false,
            'timeout' => 20,
        ]);
    }

    protected function token(string $username): string
    {
        if (!isset(self::$tokens[$username])) {
            [$status, $json] = $this->api('POST', '/api/auth/login', null, ['username' => $username, 'password' => self::PASSWORD]);
            $this->assertSame(200, $status, "login $username gagal: " . json_encode($json));
            self::$tokens[$username] = $json['data']['token'];
        }
        return self::$tokens[$username];
    }

    /** @return array{0:int, 1:array} */
    protected function api(string $method, string $path, ?string $user, ?array $body = null, array $headers = []): array
    {
        return $this->decode($this->http()->request($method, $path, $this->options($user, $body, $headers)));
    }

    /**
     * Kirim beberapa request SEKALIGUS (paralel) untuk uji konkurensi.
     * @param array<int, array{0:string,1:string,2:?string,3?:?array,4?:array}> $requests
     * @return array<int, array{0:int, 1:array}>
     */
    protected function parallel(array $requests): array
    {
        $promises = [];
        foreach ($requests as $i => $r) {
            $promises[$i] = $this->http()->requestAsync($r[0], $r[1], $this->options($r[2], $r[3] ?? null, $r[4] ?? []));
        }
        return array_map(fn (ResponseInterface $res) => $this->decode($res), Utils::unwrap($promises));
    }

    protected function db(): \PDO
    {
        return TestEnvironment::pdo();
    }

    protected function scalar(string $sql, array $params = []): mixed
    {
        $st = $this->db()->prepare($sql);
        $st->execute($params);
        return $st->fetchColumn();
    }

    protected function idByCode(string $table, string $code): int
    {
        return (int) $this->scalar("SELECT id FROM $table WHERE code = ?", [$code]);
    }

    protected function today(): string
    {
        return (new \DateTimeImmutable('now', new \DateTimeZone(getenv('APP_TIMEZONE') ?: 'Asia/Jakarta')))->format('Y-m-d');
    }

    protected function newPatient(string $name): int
    {
        [$s, $j] = $this->api('POST', '/api/patients', 'pendaftaran', [
            'name' => $name, 'birth_date' => '1990-01-01', 'gender' => 'L', 'confirm_new' => true,
            'nik' => (string) random_int(1000000000000000, 9999999999999999),
        ]);
        $this->assertSame(201, $s, json_encode($j));
        return $j['data']['id'];
    }

    protected function scheduleId(string $poliCode): int
    {
        [, $j] = $this->api('GET', '/api/doctor-schedules/available?date=' . $this->today(), 'pendaftaran');
        foreach ($j['data'] as $row) {
            if ($row['poli_id'] === $this->idByCode('polis', $poliCode)) {
                return $row['schedule_id'];
            }
        }
        $this->fail("Jadwal $poliCode hari ini tidak ada");
    }

    /** Pasien baru -> terdaftar di Poli Umum (dokter.umum). @return int visit id */
    protected function newVisit(string $name, string $poli = 'UMUM'): int
    {
        [$s, $j] = $this->api('POST', '/api/visits', 'pendaftaran', ['patient_id' => $this->newPatient($name), 'schedule_id' => $this->scheduleId($poli)]);
        $this->assertSame(201, $s, json_encode($j));
        return $j['data']['id'];
    }

    protected function assertError(array $response, int $status, string $code): void
    {
        [$s, $j] = $response;
        $this->assertSame($status, $s, json_encode($j));
        $this->assertFalse($j['success']);
        $this->assertSame($code, $j['error']['code'], json_encode($j));
    }

    private function options(?string $user, ?array $body, array $headers): array
    {
        $opt = ['headers' => $headers + ['Accept' => 'application/json']];
        if ($user !== null) {
            $opt['headers']['Authorization'] = 'Bearer ' . $this->token($user);
        }
        if ($body !== null) {
            $opt['json'] = $body;
        }
        return $opt;
    }

    private function decode(ResponseInterface $res): array
    {
        $json = json_decode((string) $res->getBody(), true);
        return [$res->getStatusCode(), is_array($json) ? $json : ['raw' => (string) $res->getBody()]];
    }
}

<?php

declare(strict_types=1);

namespace app\tests\Api;

use app\tests\Support\ApiTestCase;

/** Setiap pengguna hanya bisa mengakses fitur sesuai kewenangannya. */
class AccessControlTest extends ApiTestCase
{
    /** @dataProvider forbiddenProvider */
    public function testRoleCannotUseForeignFeature(string $user, string $method, string $path, string $needs): void
    {
        [$s, $j] = $this->api($method, $path, $user, []);
        $this->assertSame(403, $s, json_encode($j));
        $this->assertSame('FORBIDDEN', $j['error']['code']);
        $this->assertStringContainsString($needs, $j['error']['message']);
    }

    public static function forbiddenProvider(): array
    {
        return [
            'kasir membuat resep' => ['kasir', 'POST', '/api/visits/1/prescriptions', 'prescription.manage'],
            'pendaftaran menyerahkan obat' => ['pendaftaran', 'POST', '/api/prescriptions/1/dispense', 'pharmacy.process'],
            'farmasi mengisi pemeriksaan' => ['farmasi', 'PUT', '/api/visits/1/examination', 'exam.manage'],
            'lab mencatat pembayaran' => ['lab', 'POST', '/api/invoices/1/payments', 'payment.create'],
            'dokter mengelola user' => ['dokter.umum', 'GET', '/api/users', 'user.manage'],
            'dokter mengubah tarif' => ['dokter.umum', 'POST', '/api/procedures', 'master.manage'],
            'kasir mendaftarkan pasien' => ['kasir', 'POST', '/api/visits', 'registration.manage'],
            'pendaftaran mengubah stok' => ['pendaftaran', 'POST', '/api/medicines/1/stock', 'medicine.manage'],
        ];
    }

    public function testDoctorCannotTreatAnotherDoctorsPatient(): void
    {
        $visitId = $this->newVisit('Pasien Dokter Umum');     // ditangani dokter.umum
        $this->assertError($this->api('PUT', "/api/visits/$visitId/examination", 'dokter.gigi', ['anamnesis' => 'x']), 403, 'FORBIDDEN');
        [$s] = $this->api('PUT', "/api/visits/$visitId/examination", 'dokter.umum', ['anamnesis' => 'Keluhan pusing']);
        $this->assertSame(200, $s);
        [$s] = $this->api('PUT', "/api/visits/$visitId/examination", 'admin', ['anamnesis' => 'Koreksi admin']);
        $this->assertSame(200, $s);
    }

    public function testDoctorQueueOnlyShowsOwnPatients(): void
    {
        $this->newVisit('Pasien Gigi Antrean', 'GIGI');
        [, $j] = $this->api('GET', '/api/examinations/queue', 'dokter.umum');
        $doctors = array_unique(array_column($j['data'], 'doctor_name'));
        $this->assertSame(['dr. Andi Pratama'], array_values($doctors));
    }

    public function testInternalEndpointRequiresServiceToken(): void
    {
        $this->assertError($this->api('PUT', '/internal/lab-items/1/result', null, ['result_value' => '1'], ['Idempotency-Key' => 'abcdefgh1']), 401, 'UNAUTHORIZED');
        // JWT user tidak berlaku untuk endpoint internal
        $this->assertError($this->api('PUT', '/internal/lab-items/1/result', 'admin', ['result_value' => '1'], ['Idempotency-Key' => 'abcdefgh1']), 401, 'UNAUTHORIZED');
    }
}

<?php

declare(strict_types=1);

require_once __DIR__ . '/env.php';

return [
    // JWT: secret HARUS sama dengan JWT_SECRET di services-node.
    'jwt.secret' => env('JWT_SECRET', 'dev-secret-ganti-di-produksi'),
    'jwt.ttl' => (int) env('JWT_TTL', 3600),
    'jwt.issuer' => 'simrs-yii',

    // Token yang dipakai Node saat memanggil /internal/* di Yii.
    'internal.serviceToken' => env('INTERNAL_SERVICE_TOKEN', 'dev-service-token'),

    // Pengiriman event outbox ke Node.
    'node.baseUrl' => env('NODE_BASE_URL', 'http://localhost:3001'),
    'node.serviceToken' => env('NODE_SERVICE_TOKEN', 'dev-service-token'),
    'outbox.maxAttempts' => (int) env('OUTBOX_MAX_ATTEMPTS', 8),

    'cors.origins' => array_map('trim', explode(',', (string) env('CORS_ORIGINS', 'http://localhost:5173,http://localhost:3000'))),

    'hospital.name' => env('HOSPITAL_NAME', 'RS Inova Medika (Demo)'),
    'hospital.address' => env('HOSPITAL_ADDRESS', 'Jl. Contoh No. 1, Bandung'),
];

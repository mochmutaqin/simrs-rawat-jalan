# SIMRS – Node.js Services

Backend pendukung SIMRS Rawat Jalan: **API laboratorium/integrasi** dan **API dashboard**.
Business logic dan semua penulisan data tetap di Yii2. Node.js hanya **membaca** PostgreSQL
(user `app_readonly`) dan **meneruskan** penulisan hasil lab ke endpoint internal Yii.

## Struktur

```
src/
├── app.js                 # rakit express: health, auth, routes, error handler
├── server.js              # start + graceful shutdown
├── config.js              # semua konfigurasi dari env
├── db.js                  # pool pg (read-only, statement_timeout)
├── lib/
│   ├── errors.js          # AppError + helper 400/401/403/404/503
│   ├── response.js        # format response konsisten
│   ├── schemas.js         # skema zod bersama (periode, paging, id)
│   └── yiiClient.js       # klien Yii: timeout, retry backoff, idempotency key
├── middleware/
│   ├── auth.js            # verifikasi JWT, requirePermission, serviceAuth
│   ├── validate.js        # validasi params/query/body dengan zod
│   └── errorHandler.js    # 404 route + handler error terpusat
└── routes/
    ├── lab.js             # /api/v1/lab/*
    ├── dashboard.js       # /api/v1/dashboard/*
    └── integration.js     # /api/v1/integration/events
test/api.test.js           # 18 tes integrasi (Postgres nyata + Yii palsu)
```

## Menjalankan

```bash
# 1. database (dari root repo)
docker compose up -d

# 2. service
cd services-node
cp .env.example .env        # sesuaikan JWT_SECRET agar sama dengan Yii
npm install
npm start                   # http://localhost:3001/health
```

`.env` tidak dibaca otomatis. Jalankan dengan `node --env-file=.env src/server.js`, atau export variabelnya.

## Tes

Butuh PostgreSQL dengan `database/001_schema.sql` dan user `app_readonly` (sudah otomatis lewat docker compose).
Tes **mengosongkan data transaksi** (TRUNCATE), jadi pakai database khusus tes.

```bash
DB_HOST=localhost DB_PORT=5432 DB_USER=app_readonly DB_PASSWORD=readonly \
TEST_DB_ADMIN_URL=postgres://postgres:postgres@localhost:5432/simrs \
npm test
```

Yang diuji: JWT (tidak ada / rusak / kedaluwarsa), RBAC 403, validasi 400 per field, daftar/detail/404 lab,
penerusan hasil lab ke Yii (header token + idempotency key), **retry saat Yii error sesaat dengan kunci yang sama**,
**503 saat Yii mati**, penolakan 4xx tanpa retry, angka dashboard vs data seed, filter & paginasi, validasi periode,
**Node tidak bisa INSERT/UPDATE**, dan event integrasi idempoten.

Dokumentasi endpoint: [`docs/API.md`](docs/API.md).

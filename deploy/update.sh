#!/usr/bin/env bash
# =====================================================================
# SIMRS Rawat Jalan - update aplikasi di server setelah ada commit baru
# Author: Mochamad Mutaqin Kurniawan <mochmutaqin@gmail.com>
#
# Pemakaian: sudo bash deploy/update.sh
# Menarik kode terbaru, menjalankan migrasi, build ulang frontend, lalu restart service.
# =====================================================================
set -euo pipefail

[[ $EUID -eq 0 ]] || { echo "Jalankan dengan sudo."; exit 1; }
APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_USER=simrs
PHP_VER="$(php -r 'echo PHP_MAJOR_VERSION . "." . PHP_MINOR_VERSION;')"
step() { printf '\n\033[1;32m==> %s\033[0m\n' "$*"; }
as_app() { sudo -u "$APP_USER" -H "$@"; }

step "1/5 Ambil kode terbaru"
as_app git -C "$APP_DIR" pull --ff-only

step "2/5 Backend Yii: composer & migrasi"
as_app bash -c "cd '$APP_DIR/backend-yii' && composer install --no-dev --optimize-autoloader --no-interaction --no-progress"
# schema cache dibuang setelah migrasi agar struktur tabel baru langsung terbaca
as_app bash -c "cd '$APP_DIR/backend-yii' && php yii migrate --interactive=0 && php yii cache/flush-schema db --interactive=0"
sudo -u postgres psql -v ON_ERROR_STOP=1 -q -d simrs -c 'GRANT SELECT ON ALL TABLES IN SCHEMA public TO app_readonly'

step "3/5 services-node: dependensi"
as_app bash -c "cd '$APP_DIR/services-node' && npm ci --omit=dev --no-audit --no-fund"

step "4/5 Frontend: build ulang"
as_app bash -c "cd '$APP_DIR/frontend' && npm ci --no-audit --no-fund && npm run build"

step "5/5 Restart service"
systemctl restart simrs-node simrs-outbox
systemctl reload "php$PHP_VER-fpm"
sleep 2
for url in http://127.0.0.1:8080/api/health http://127.0.0.1:3001/health; do
  if curl -fsS -o /dev/null --max-time 10 "$url"; then echo "  OK     $url"; else echo "  GAGAL  $url"; exit 1; fi
done
echo "Update selesai."

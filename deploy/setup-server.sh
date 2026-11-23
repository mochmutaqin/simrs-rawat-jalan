#!/usr/bin/env bash
# =====================================================================
# SIMRS Rawat Jalan - instalasi pertama di server Ubuntu 24.04
# Author: Mochamad Mutaqin Kurniawan
#
# Pemakaian (sebagai root, dari folder repo yang sudah di-clone ke /var/www/simrs):
#   sudo bash deploy/setup-server.sh <domain-atau-ip> [--demo] [--email ALAMAT]
#
#   --demo           isi data demo (akun per role, password password123).
#                    Tanpa ini hanya dibuat akun "admin" dengan password acak (ditampilkan di akhir).
#   --email ALAMAT   pasang HTTPS gratis dari Let's Encrypt (alamat untuk notifikasi sertifikat).
#                    Domain harus sudah mengarah ke IP server.
#
# Aman dijalankan ulang: password & secret yang sudah ada di .env tidak diganti,
# data yang sudah ada tidak dihapus.
# =====================================================================
set -euo pipefail

usage() { echo "Pemakaian: sudo bash deploy/setup-server.sh <domain-atau-ip> [--demo] [--email ALAMAT]"; exit 1; }
DOMAIN="${1:-}"
[[ -z "$DOMAIN" || "$DOMAIN" == -* ]] && usage
shift
DEMO=0
LE_CONTACT=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --demo) DEMO=1 ;;
    --email) LE_CONTACT="${2:-}"; [[ -z "$LE_CONTACT" ]] && usage; shift ;;
    *) echo "Opsi tidak dikenal: $1"; usage ;;
  esac
  shift
done

[[ $EUID -eq 0 ]] || { echo "Jalankan dengan sudo."; exit 1; }
APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
case "$APP_DIR" in
  /root/*|/home/*) echo "Pindahkan repo ke /var/www/simrs dulu (Nginx tidak bisa membaca folder $APP_DIR)."; exit 1 ;;
esac

APP_USER=simrs
DB_NAME=simrs
DB_APP_USER=simrs_app
PHP_SOCK=/run/php/simrs.sock
YII_ENV_FILE="$APP_DIR/backend-yii/.env"
NODE_ENV_FILE="$APP_DIR/services-node/.env"

step() { printf '\n\033[1;32m==> %s\033[0m\n' "$*"; }
as_app() { sudo -u "$APP_USER" -H "$@"; }
psql_admin() { sudo -u postgres psql -v ON_ERROR_STOP=1 -q "$@"; }
rand() { openssl rand -hex "${1:-24}"; }
env_get() { [[ -f "$1" ]] && grep -E "^$2=" "$1" | tail -n1 | cut -d= -f2- || true; }
render() {
  sed -e "s#__DOMAIN__#$DOMAIN#g" -e "s#__APP_DIR__#$APP_DIR#g" -e "s#__APP_USER__#$APP_USER#g" \
      -e "s#__PHP_SOCK__#$PHP_SOCK#g" -e "s#__NODE_BIN__#$(command -v node)#g" -e "s#__PHP_BIN__#$(command -v php)#g" "$1" > "$2"
}

# ---------------------------------------------------------------------
step "1/9 Paket sistem (Nginx, PostgreSQL, PHP, Node.js)"
export DEBIAN_FRONTEND=noninteractive
apt-get update -q
apt-get install -y -q nginx postgresql php-fpm php-cli php-pgsql php-mbstring php-xml php-intl php-curl php-zip \
  composer git unzip curl openssl ca-certificates gnupg
php -r 'exit(PHP_VERSION_ID >= 80200 ? 0 : 1);' || { echo "Butuh PHP 8.2+. Pakai Ubuntu 24.04."; exit 1; }
if ! command -v node >/dev/null || (( $(node -p 'process.versions.node.split(".")[0]') < 20 )); then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y -q nodejs
fi
PHP_VER="$(php -r 'echo PHP_MAJOR_VERSION . "." . PHP_MINOR_VERSION;')"
echo "PHP $PHP_VER, Node $(node -v), $(psql --version)"

# ---------------------------------------------------------------------
step "2/9 Zona waktu & user aplikasi"
timedatectl set-timezone Asia/Jakarta 2>/dev/null || true
id "$APP_USER" >/dev/null 2>&1 || useradd --system --create-home --home-dir "/home/$APP_USER" --shell /usr/sbin/nologin "$APP_USER"
chown -R "$APP_USER:$APP_USER" "$APP_DIR"

# ---------------------------------------------------------------------
step "3/9 Database & file konfigurasi (.env)"
if [[ "$(env_get "$YII_ENV_FILE" DB_USER)" == "$DB_APP_USER" ]]; then
  echo "Memakai secret yang sudah ada di .env"
  DB_APP_PASS="$(env_get "$YII_ENV_FILE" DB_PASSWORD)"
  JWT_SECRET="$(env_get "$YII_ENV_FILE" JWT_SECRET)"
  INTERNAL_TOKEN="$(env_get "$YII_ENV_FILE" INTERNAL_SERVICE_TOKEN)"
  NODE_TOKEN="$(env_get "$YII_ENV_FILE" NODE_SERVICE_TOKEN)"
  RO_PASS="$(env_get "$NODE_ENV_FILE" DB_PASSWORD)"
else
  [[ -f "$YII_ENV_FILE" ]] && mv "$YII_ENV_FILE" "$YII_ENV_FILE.bak.$(date +%s)"
  [[ -f "$NODE_ENV_FILE" ]] && mv "$NODE_ENV_FILE" "$NODE_ENV_FILE.bak.$(date +%s)"
  DB_APP_PASS="$(rand 16)"; RO_PASS="$(rand 16)"
  JWT_SECRET="$(rand 32)"; INTERNAL_TOKEN="$(rand 24)"; NODE_TOKEN="$(rand 24)"
fi
RO_PASS="${RO_PASS:-$(rand 16)}"

psql_admin <<SQL
DO \$\$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '$DB_APP_USER') THEN
    CREATE ROLE $DB_APP_USER LOGIN PASSWORD '$DB_APP_PASS';
  ELSE
    ALTER ROLE $DB_APP_USER LOGIN PASSWORD '$DB_APP_PASS';
  END IF;
END \$\$;
SQL
if ! sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname = '$DB_NAME'" | grep -q 1; then
  sudo -u postgres createdb -O "$DB_APP_USER" -E UTF8 "$DB_NAME"
fi

ORIGINS="https://$DOMAIN,http://$DOMAIN"
cat > "$YII_ENV_FILE" <<EOF
# Dibuat oleh deploy/setup-server.sh. Rahasia, jangan di-commit.
APP_TIMEZONE=Asia/Jakarta
YII_DEBUG=false
YII_ENV=prod

DB_HOST=127.0.0.1
DB_PORT=5432
DB_NAME=$DB_NAME
DB_USER=$DB_APP_USER
DB_PASSWORD=$DB_APP_PASS

# sama dengan JWT_SECRET di services-node/.env
JWT_SECRET=$JWT_SECRET
JWT_TTL=3600

# Node -> Yii (/internal/*), sama dengan YII_SERVICE_TOKEN di services-node/.env
INTERNAL_SERVICE_TOKEN=$INTERNAL_TOKEN
# Yii -> Node (event outbox), sama dengan SERVICE_TOKEN di services-node/.env
NODE_BASE_URL=http://127.0.0.1:3001
NODE_SERVICE_TOKEN=$NODE_TOKEN

CORS_ORIGINS=$ORIGINS
EOF
cat > "$NODE_ENV_FILE" <<EOF
# Dibuat oleh deploy/setup-server.sh. Rahasia, jangan di-commit.
TZ=Asia/Jakarta
APP_TIMEZONE=Asia/Jakarta
NODE_ENV=production
HOST=127.0.0.1
PORT=3001

JWT_SECRET=$JWT_SECRET
SERVICE_TOKEN=$NODE_TOKEN

DB_HOST=127.0.0.1
DB_PORT=5432
DB_NAME=$DB_NAME
DB_USER=app_readonly
DB_PASSWORD=$RO_PASS

YII_BASE_URL=http://127.0.0.1:8080
YII_SERVICE_TOKEN=$INTERNAL_TOKEN
YII_TIMEOUT_MS=3000
YII_RETRIES=2

CORS_ORIGINS=$ORIGINS
EOF
chown "$APP_USER:$APP_USER" "$YII_ENV_FILE" "$NODE_ENV_FILE"
chmod 600 "$YII_ENV_FILE" "$NODE_ENV_FILE"

# ---------------------------------------------------------------------
step "4/9 Backend Yii: composer & migrasi skema"
as_app bash -c "cd '$APP_DIR/backend-yii' && composer install --no-dev --optimize-autoloader --no-interaction --no-progress"
as_app mkdir -p "$APP_DIR/backend-yii/runtime" "$APP_DIR/backend-yii/web/assets"
as_app bash -c "cd '$APP_DIR/backend-yii' && php yii migrate --interactive=0 && php yii cache/flush-schema db --interactive=0"
# user read-only untuk services-node (tabel milik simrs_app, termasuk tabel baru di migrasi berikutnya)
psql_admin -d "$DB_NAME" -f "$APP_DIR/database/003_readonly_user.sql"
psql_admin -d "$DB_NAME" <<SQL
ALTER ROLE app_readonly PASSWORD '$RO_PASS';
ALTER DEFAULT PRIVILEGES FOR ROLE $DB_APP_USER IN SCHEMA public GRANT SELECT ON TABLES TO app_readonly;
SQL

# ---------------------------------------------------------------------
step "5/9 Akun & data awal"
ADMIN_PASS=""
USERS="$(sudo -u postgres psql -d "$DB_NAME" -tAc 'SELECT count(*) FROM users')"
if (( DEMO )); then
  as_app bash -c "cd '$APP_DIR/backend-yii' && php yii seed/demo"
elif [[ "$USERS" == "0" ]]; then
  ADMIN_PASS="$(rand 6)"
  as_app bash -c "cd '$APP_DIR/backend-yii' && php yii seed/admin admin '$ADMIN_PASS'"
else
  echo "Sudah ada $USERS akun, dilewati."
fi

# ---------------------------------------------------------------------
step "6/9 services-node: dependensi"
as_app bash -c "cd '$APP_DIR/services-node' && npm ci --omit=dev --no-audit --no-fund"

# ---------------------------------------------------------------------
step "7/9 Frontend: build ke frontend/dist"
as_app bash -c "cd '$APP_DIR/frontend' && npm ci --no-audit --no-fund && npm run build"

# ---------------------------------------------------------------------
step "8/9 PHP-FPM, Nginx, service systemd"
render "$APP_DIR/deploy/php-fpm/simrs.conf" "/etc/php/$PHP_VER/fpm/pool.d/simrs.conf"
render "$APP_DIR/deploy/nginx/simrs.conf" /etc/nginx/sites-available/simrs
ln -sf /etc/nginx/sites-available/simrs /etc/nginx/sites-enabled/simrs
rm -f /etc/nginx/sites-enabled/default
render "$APP_DIR/deploy/systemd/simrs-node.service" /etc/systemd/system/simrs-node.service
render "$APP_DIR/deploy/systemd/simrs-outbox.service" /etc/systemd/system/simrs-outbox.service
echo "30 1 * * * root bash $APP_DIR/deploy/backup-db.sh >> /var/log/simrs-backup.log 2>&1" > /etc/cron.d/simrs-backup
nginx -t
systemctl daemon-reload
systemctl enable "php$PHP_VER-fpm" nginx simrs-node simrs-outbox >/dev/null
systemctl restart "php$PHP_VER-fpm" simrs-node simrs-outbox
systemctl reload-or-restart nginx

# ---------------------------------------------------------------------
step "9/9 HTTPS & pengecekan"
SCHEME=http
if [[ -n "$LE_CONTACT" ]]; then
  apt-get install -y -q certbot python3-certbot-nginx
  certbot --nginx -d "$DOMAIN" -m "$LE_CONTACT" --agree-tos --non-interactive --redirect
  SCHEME=https
fi
sleep 2
FAILED=0
check() {
  if curl -fsS -o /dev/null --max-time 10 "$@"; then echo "  OK     ${*: -1}"; else echo "  GAGAL  ${*: -1}"; FAILED=1; fi
}
check http://127.0.0.1:8080/api/health
check http://127.0.0.1:3001/health
check -H "Host: $DOMAIN" -L -k http://127.0.0.1/
check -H "Host: $DOMAIN" -L -k http://127.0.0.1/node/health

echo
if (( FAILED )); then
  echo "Ada yang gagal. Cek log: journalctl -u simrs-node -n 50, journalctl -u simrs-outbox -n 50, /var/log/nginx/error.log"
  exit 1
fi
echo "Selesai. Buka $SCHEME://$DOMAIN"
if (( DEMO )); then
  echo "Akun demo: admin, pendaftaran, dokter.umum, farmasi, lab, kasir (password: password123)."
  echo "Ganti password akun demo sebelum dipakai sungguhan."
elif [[ -n "$ADMIN_PASS" ]]; then
  echo "Akun admin: admin / $ADMIN_PASS  (simpan, lalu ganti setelah login)"
fi
echo "Update berikutnya: sudo bash $APP_DIR/deploy/update.sh"

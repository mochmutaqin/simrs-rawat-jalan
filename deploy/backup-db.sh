#!/usr/bin/env bash
# =====================================================================
# SIMRS Rawat Jalan - backup database harian
# Author: Mochamad Mutaqin Kurniawan <mochmutaqin@gmail.com>
#
# Dipasang setup-server.sh sebagai cron jam 01.30 (/etc/cron.d/simrs-backup).
# Manual: sudo bash deploy/backup-db.sh
# Pulihkan: sudo -u postgres pg_restore --clean --if-exists -d simrs /var/backups/simrs/<file>.dump
# =====================================================================
set -euo pipefail

DIR=/var/backups/simrs
KEEP_DAYS="${KEEP_DAYS:-14}"
mkdir -p "$DIR"
chmod 700 "$DIR"
FILE="$DIR/simrs_$(date +%F_%H%M).dump"
runuser -u postgres -- pg_dump -Fc -d simrs > "$FILE"
find "$DIR" -name 'simrs_*.dump' -mtime +"$KEEP_DAYS" -delete
echo "$(date '+%F %T') backup: $FILE ($(du -h "$FILE" | cut -f1))"

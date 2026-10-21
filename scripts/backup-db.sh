#!/usr/bin/env bash
set -euo pipefail

HOST="${MYSQL_HOST:-127.0.0.1}"
USER="${MYSQL_USER:-taskforge}"
DB="${MYSQL_DATABASE:-taskforge}"
OUT_DIR="${BACKUP_DIR:-./backups}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
FILE="${OUT_DIR}/taskforge-${STAMP}.sql.gz"

mkdir -p "$OUT_DIR"
echo "Dumping ${DB} from ${HOST} -> ${FILE}"
mysqldump -h "$HOST" -u "$USER" -p"${MYSQL_PWD:-taskforge}" "$DB" | gzip > "$FILE"
echo "Done ($(du -h "$FILE" | cut -f1))"

#!/usr/bin/env bash
set -euo pipefail

FILE="${1:-}"
if [[ -z "$FILE" ]]; then
  echo "Usage: $0 <backup.sql.gz>"
  exit 1
fi

HOST="${MYSQL_HOST:-127.0.0.1}"
USER="${MYSQL_USER:-taskforge}"
DB="${MYSQL_DATABASE:-taskforge}"

echo "Restoring ${FILE} into ${DB}@${HOST}"
gzip -dc "$FILE" | mysql -h "$HOST" -u "$USER" -p"${MYSQL_PWD:-taskforge}" "$DB"
echo "Restore complete"

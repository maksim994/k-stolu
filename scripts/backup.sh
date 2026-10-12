#!/bin/sh
set -eu
umask 077

DB=${1:?Usage: sh scripts/backup.sh DB_CONTAINER APP_CONTAINER [BACKUP_DIRECTORY]}
APP=${2:?Specify the application container}
DEST=${3:-backups/$(date -u +%Y%m%dT%H%M%SZ)}
if [ -e "$DEST" ]; then
  printf '%s\n' "Backup directory already exists: $DEST" >&2
  exit 1
fi
docker inspect "$DB" "$APP" >/dev/null
mkdir -p "$DEST"
docker exec "$DB" sh -c 'exec pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc --no-owner --no-acl' > "$DEST/catalog.dump.partial"
docker exec -i "$DB" pg_restore --list < "$DEST/catalog.dump.partial" >/dev/null
docker exec "$APP" tar -C /app/uploads -czf - . > "$DEST/uploads.tar.gz.partial"
docker exec -i "$APP" tar -tzf - < "$DEST/uploads.tar.gz.partial" >/dev/null
docker inspect --format '{{.Image}}' "$APP" > "$DEST/image-id.txt"
mv "$DEST/catalog.dump.partial" "$DEST/catalog.dump"
mv "$DEST/uploads.tar.gz.partial" "$DEST/uploads.tar.gz"
printf '%s\n' "Backup ready: $DEST" "Copy it to storage outside this server. Runtime secrets must be backed up separately."

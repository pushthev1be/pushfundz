#!/bin/bash


set -e

BACKUP_DIR="./backups"
DATE=$(date +%Y%m%d_%H%M%S)
DB_BACKUP_FILE="$BACKUP_DIR/pushfundz_db_$DATE.sql"

echo "📦 Starting backup process..."

mkdir -p $BACKUP_DIR

if [ -f ".env.production" ]; then
    export $(cat .env.production | grep -v '^#' | xargs)
fi

echo "🗄️ Backing up database..."
docker-compose -f docker-compose.production.yml exec -T db pg_dump -U pushfundz_user pushfundz > $DB_BACKUP_FILE

echo "🗜️ Compressing backup..."
gzip $DB_BACKUP_FILE

echo "🧹 Cleaning up old backups..."
find $BACKUP_DIR -name "pushfundz_db_*.sql.gz" -mtime +7 -delete

echo "✅ Backup completed: ${DB_BACKUP_FILE}.gz"

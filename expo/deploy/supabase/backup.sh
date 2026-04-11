#!/bin/bash
set -euo pipefail

# ============================================================
# IVX Holdings — Self-Hosted Supabase Backup Script
# Creates timestamped pg_dump backups with retention policy.
#
# Usage:
#   ./deploy/supabase/backup.sh
#   BACKUP_DIR=/mnt/backups ./deploy/supabase/backup.sh
#
# Env vars:
#   POSTGRES_HOST     (default: localhost)
#   POSTGRES_PORT     (default: 5432)
#   POSTGRES_DB       (default: postgres)
#   POSTGRES_PASSWORD (required)
#   BACKUP_DIR        (default: ./backups)
#   BACKUP_RETAIN_DAYS (default: 30)
#   S3_BACKUP_BUCKET  (optional — upload to S3)
# ============================================================

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log()   { echo -e "${BLUE}[$(date '+%Y-%m-%d %H:%M:%S')]${NC} $1"; }
ok()    { echo -e "${GREEN}[OK]${NC} $1"; }
warn()  { echo -e "${YELLOW}[WARN]${NC} $1"; }
error() { echo -e "${RED}[ERROR]${NC} $1"; exit 1; }

PG_HOST="${POSTGRES_HOST:-localhost}"
PG_PORT="${POSTGRES_PORT:-5432}"
PG_DB="${POSTGRES_DB:-postgres}"
PG_PASS="${POSTGRES_PASSWORD:-}"
BACKUP_DIR="${BACKUP_DIR:-./backups}"
RETAIN_DAYS="${BACKUP_RETAIN_DAYS:-30}"
S3_BUCKET="${S3_BACKUP_BUCKET:-}"
TIMESTAMP=$(date '+%Y%m%d_%H%M%S')
BACKUP_FILE="ivx_supabase_${TIMESTAMP}.sql.gz"

[ -z "$PG_PASS" ] && error "POSTGRES_PASSWORD is required"
command -v pg_dump >/dev/null 2>&1 || error "pg_dump not found. Install postgresql-client."

mkdir -p "$BACKUP_DIR"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  IVX Holdings — Supabase Backup"
echo "  Host: ${PG_HOST}:${PG_PORT}/${PG_DB}"
echo "  Output: ${BACKUP_DIR}/${BACKUP_FILE}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

log "Starting database dump..."
START_TIME=$(date +%s)

export PGPASSWORD="$PG_PASS"
pg_dump \
  -h "$PG_HOST" \
  -p "$PG_PORT" \
  -U postgres \
  -d "$PG_DB" \
  --no-owner \
  --no-privileges \
  --clean \
  --if-exists \
  --verbose \
  2>/dev/null | gzip > "${BACKUP_DIR}/${BACKUP_FILE}"

END_TIME=$(date +%s)
ELAPSED=$((END_TIME - START_TIME))
FILE_SIZE=$(du -sh "${BACKUP_DIR}/${BACKUP_FILE}" | cut -f1)

ok "Backup complete in ${ELAPSED}s — size: ${FILE_SIZE}"

# Schema-only backup for quick reference
SCHEMA_FILE="ivx_supabase_${TIMESTAMP}_schema.sql"
log "Creating schema-only backup..."
pg_dump \
  -h "$PG_HOST" \
  -p "$PG_PORT" \
  -U postgres \
  -d "$PG_DB" \
  --schema-only \
  --no-owner \
  --no-privileges \
  2>/dev/null > "${BACKUP_DIR}/${SCHEMA_FILE}"
ok "Schema backup: ${BACKUP_DIR}/${SCHEMA_FILE}"

# Upload to S3 if configured
if [ -n "$S3_BUCKET" ]; then
  if command -v aws >/dev/null 2>&1; then
    log "Uploading to S3: s3://${S3_BUCKET}/supabase-backups/${BACKUP_FILE}"
    aws s3 cp "${BACKUP_DIR}/${BACKUP_FILE}" "s3://${S3_BUCKET}/supabase-backups/${BACKUP_FILE}" --storage-class STANDARD_IA
    aws s3 cp "${BACKUP_DIR}/${SCHEMA_FILE}" "s3://${S3_BUCKET}/supabase-backups/${SCHEMA_FILE}"
    ok "Uploaded to S3"
  else
    warn "aws CLI not found — skipping S3 upload"
  fi
fi

# Cleanup old backups
if [ "$RETAIN_DAYS" -gt 0 ]; then
  log "Cleaning backups older than ${RETAIN_DAYS} days..."
  DELETED=$(find "$BACKUP_DIR" -name "ivx_supabase_*.sql*" -mtime +"$RETAIN_DAYS" -delete -print | wc -l)
  if [ "$DELETED" -gt 0 ]; then
    ok "Deleted ${DELETED} old backup files"
  else
    log "No old backups to clean"
  fi
fi

# Summary
TOTAL_BACKUPS=$(find "$BACKUP_DIR" -name "ivx_supabase_*.sql.gz" | wc -l)
TOTAL_SIZE=$(du -sh "$BACKUP_DIR" 2>/dev/null | cut -f1)

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Backup: ${BACKUP_DIR}/${BACKUP_FILE} (${FILE_SIZE})"
echo "  Schema: ${BACKUP_DIR}/${SCHEMA_FILE}"
echo "  Total backups: ${TOTAL_BACKUPS} (${TOTAL_SIZE} total)"
echo "  Retention: ${RETAIN_DAYS} days"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

#!/usr/bin/env bash
# ==============================================================================
# TruthGuard AI Automated Database Backup Script
# Creates compressed, timestamped PostgreSQL backups with checksum and retention
# ==============================================================================

set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-./backups}"
TIMESTAMP="$(date +'%Y%m%d_%H%M%S')"
BACKUP_FILE="${BACKUP_DIR}/truthguard_backup_${TIMESTAMP}.sql.gz"
RETENTION_DAYS="${RETENTION_DAYS:-14}"

mkdir -p "${BACKUP_DIR}"

echo "[INFO] Starting database backup at $(date)..."

# Support either Docker container execution or direct pg_dump
if [ -n "${DOCKER_CONTAINER:-}" ]; then
  docker exec -t "${DOCKER_CONTAINER}" pg_dump -U "${POSTGRES_USER:-truthguard}" "${POSTGRES_DB:-truthguard}" | gzip > "${BACKUP_FILE}"
elif [ -n "${DATABASE_URL:-}" ]; then
  pg_dump "${DATABASE_URL}" | gzip > "${BACKUP_FILE}"
else
  pg_dump -h "${PGHOST:-localhost}" -p "${PGPORT:-5432}" -U "${PGUSER:-truthguard}" "${PGDATABASE:-truthguard}" | gzip > "${BACKUP_FILE}"
fi

# Generate SHA256 checksum for audit & verification
sha256sum "${BACKUP_FILE}" > "${BACKUP_FILE}.sha256"

echo "[SUCCESS] Backup written to: ${BACKUP_FILE}"
echo "[SUCCESS] Checksum written to: ${BACKUP_FILE}.sha256"

# Cleanup backups older than RETENTION_DAYS
echo "[INFO] Cleaning up backups older than ${RETENTION_DAYS} days..."
find "${BACKUP_DIR}" -type f -name "truthguard_backup_*.sql.gz*" -mtime "+${RETENTION_DAYS}" -exec rm -f {} \;
echo "[SUCCESS] Backup routine completed."

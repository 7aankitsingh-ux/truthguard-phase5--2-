#!/usr/bin/env bash
# ==============================================================================
# TruthGuard AI Database Restore Script
# Restores PostgreSQL database from backup archive with safety checks
# ==============================================================================

set -euo pipefail

if [ -z "${1:-}" ]; then
  echo "Usage: $0 <path_to_backup.sql.gz>"
  exit 1
fi

BACKUP_FILE="$1"

if [ ! -f "${BACKUP_FILE}" ]; then
  echo "[ERROR] Backup file not found: ${BACKUP_FILE}"
  exit 1
fi

# Verify checksum if present
if [ -f "${BACKUP_FILE}.sha256" ]; then
  echo "[INFO] Verifying checksum..."
  sha256sum -c "${BACKUP_FILE}.sha256"
fi

echo "[WARNING] This will overwrite database data in ${POSTGRES_DB:-truthguard}. Continue? (y/N)"
read -r CONFIRM
if [[ ! "$CONFIRM" =~ ^[Yy]$ ]]; then
  echo "[INFO] Restore aborted."
  exit 0
fi

echo "[INFO] Restoring database..."
if [ -n "${DOCKER_CONTAINER:-}" ]; then
  gunzip -c "${BACKUP_FILE}" | docker exec -i "${DOCKER_CONTAINER}" psql -U "${POSTGRES_USER:-truthguard}" -d "${POSTGRES_DB:-truthguard}"
elif [ -n "${DATABASE_URL:-}" ]; then
  gunzip -c "${BACKUP_FILE}" | psql "${DATABASE_URL}"
else
  gunzip -c "${BACKUP_FILE}" | psql -h "${PGHOST:-localhost}" -p "${PGPORT:-5432}" -U "${PGUSER:-truthguard}" -d "${PGDATABASE:-truthguard}"
fi

echo "[SUCCESS] Database successfully restored."

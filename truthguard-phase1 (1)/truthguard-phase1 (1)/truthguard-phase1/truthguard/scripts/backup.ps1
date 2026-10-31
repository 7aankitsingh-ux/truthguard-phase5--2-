# ==============================================================================
# TruthGuard AI Automated Database Backup Script (PowerShell)
# ==============================================================================

param (
    [string]$BackupDir = ".\backups",
    [string]$ContainerName = "truthguard-db",
    [string]$DbUser = "truthguard",
    [string]$DbName = "truthguard",
    [int]$RetentionDays = 14
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path $BackupDir)) {
    New-Item -ItemType Directory -Path $BackupDir -Force | Out-Null
}

$timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
$backupFile = Join-Path $BackupDir "truthguard_backup_$timestamp.sql"

Write-Host "[INFO] Starting database backup: $backupFile"

# Execute pg_dump via docker or local CLI
try {
    docker exec $ContainerName pg_dump -U $DbUser $DbName | Out-File -FilePath $backupFile -Encoding utf8
    Write-Host "[SUCCESS] Database dumped to $backupFile"

    # Compute hash
    $hash = Get-FileHash -Path $backupFile -Algorithm SHA256
    $hash.Hash | Out-File -FilePath "$backupFile.sha256" -Encoding ascii
    Write-Host "[SUCCESS] Checksum generated: $($hash.Hash)"

    # Prune older than retention days
    $limit = (Get-Date).AddDays(-$RetentionDays)
    Get-ChildItem -Path $BackupDir -Filter "truthguard_backup_*" | Where-Object { $_.CreationTime -lt $limit } | Remove-Item -Force
    Write-Host "[INFO] Old backups pruned."
} catch {
    Write-Error "[ERROR] Backup failed: $_"
    exit 1
}

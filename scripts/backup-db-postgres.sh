#!/usr/bin/env bash

# Subsoccer Pro — Supabase PostgreSQL Raw SQL Backup Script (pg_dump)
#
# This script performs a full database schema & data dump using pg_dump.
# It prefers running pg_dump inside a Docker container (Postgres v17)
# to avoid version mismatches and local dependency pollution.
#
# Usage:
#   bash scripts/backup-db-postgres.sh

# Exit immediately if a command exits with a non-zero status
set -e

# Target database details
DB_HOST="db.ujxmmrsmdwrgcwatdhvx.supabase.co"
DB_USER="postgres"
DB_NAME="postgres"
DB_PORT=5432

# Get current directories
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
BACKUP_DIR="$PROJECT_ROOT/database/backups"

echo "=================================================="
echo "    Subsoccer Pro — Supabase DB SQL Exporter     "
echo "=================================================="
echo "🔗 Target Database: $DB_HOST"
echo "📂 Backup Directory: $BACKUP_DIR"
echo "--------------------------------------------------"

# Ensure backup directory exists
mkdir -p "$BACKUP_DIR"

# Securely read password
if [ -n "$SUPABASE_DB_PASSWORD" ]; then
    DB_PASSWORD="$SUPABASE_DB_PASSWORD"
    echo "🔑 Using database password from environment variable SUPABASE_DB_PASSWORD."
else
    echo -n "🔑 Enter your remote Supabase database password: "
    read -s DB_PASSWORD
    echo ""
    if [ -z "$DB_PASSWORD" ]; then
        echo "❌ Error: Password cannot be empty."
        exit 1
    fi
fi

# Define backup filename
TIMESTAMP=$(date +"%Y-%m-%dT%H-%M-%S")
FILENAME="db-postgres-backup-$TIMESTAMP.sql"
OUTPUT_FILE="$BACKUP_DIR/$FILENAME"

# Function to run pg_dump locally
run_local_pg_dump() {
    echo "🔍 Running pg_dump locally..."
    export PGPASSWORD="$DB_PASSWORD"
    pg_dump -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -F p -b -v -f "$OUTPUT_FILE"
    unset PGPASSWORD
}

# Function to run pg_dump via Docker
run_docker_pg_dump() {
    echo "🐳 Running pg_dump via Docker (PostgreSQL 17)..."
    
    # We mount the local backup directory into the Docker container
    # Netlify/Docker requires absolute pathing
    docker run --rm \
      -e PGPASSWORD="$DB_PASSWORD" \
      -v "$BACKUP_DIR:/backups" \
      postgres:17-alpine \
      pg_dump -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -F p -b -v -f "/backups/$FILENAME"
}

# Determine execution path
if command -v docker &> /dev/null && docker info &> /dev/null; then
    # Docker is installed and running
    run_docker_pg_dump
elif command -v pg_dump &> /dev/null; then
    # Local pg_dump is available
    echo "⚠️ Warning: Docker is not running or installed. Falling back to local pg_dump."
    
    # Check version match (recommends PG v17)
    LOCAL_VERSION=$(pg_dump --version | head -n1 | awk '{print $3}' | cut -d. -f1)
    if [ "$LOCAL_VERSION" != "17" ]; then
        echo "⚠️ Warning: Local pg_dump version ($LOCAL_VERSION) does not match remote version (17)."
        echo "   Backups may fail or contain structure discrepancies."
    fi
    run_local_pg_dump
else
    # Neither Docker nor pg_dump is available
    echo "❌ Error: Neither Docker nor pg_dump was found on your system."
    echo "--------------------------------------------------"
    echo "To resolve this, you can:"
    echo "  1. Start Docker on your machine."
    echo "  2. Install postgresql tools locally: brew install libpq && brew link --force libpq"
    echo "  3. OR use the REST API backup instead (which requires no installation):"
    echo "     node scripts/backup-db-data.js"
    echo "--------------------------------------------------"
    exit 1
fi

echo "--------------------------------------------------"
echo "🎉 SUCCESS! SQL Backup created successfully."
echo "📁 Saved to: $OUTPUT_FILE"
echo "💾 File size: $(du -h "$OUTPUT_FILE" | cut -f1)"
echo "=================================================="

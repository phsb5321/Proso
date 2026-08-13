#!/bin/sh
# Predeploy script for Dokku
# Fixes postgres:// → postgresql:// scheme required by Prisma 7+
# Dokku's postgres plugin injects DATABASE_URL with postgres:// scheme,
# which Prisma 7 rejects (it requires postgresql://).

set -e

DB_URL="${DATABASE_URL}"

# Replace postgres:// with postgresql:// if needed (but don't touch postgresql://)
DB_URL=$(echo "$DB_URL" | sed 's|^postgres://|postgresql://|')
export DATABASE_URL="$DB_URL"

echo "Preparing the licence issuance schema bridge..."
npx prisma db execute \
  --config /app/prisma/prisma.config.ts \
  --file /app/scripts/prepare-license-issuance-schema.sql

echo "Running prisma db push..."
npx prisma db push --url "$DB_URL" --schema /app/prisma/schema.prisma

# A fresh database had no tables during the first bridge pass. Re-run the
# idempotent bridge so database-only checks (which Prisma cannot express) are
# present there too; existing deployments see no-op DDL.
echo "Finalizing Paddle provisioning constraints..."
npx prisma db execute \
  --config /app/prisma/prisma.config.ts \
  --file /app/scripts/prepare-license-issuance-schema.sql

echo "Predeploy complete."

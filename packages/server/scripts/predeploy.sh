#!/bin/sh
# Predeploy script for Dokku
# Fixes postgres:// → postgresql:// scheme required by Prisma 7+
# Dokku's postgres plugin injects DATABASE_URL with postgres:// scheme,
# which Prisma 7 rejects (it requires postgresql://).

set -e

DB_URL="${DATABASE_URL}"

# Replace postgres:// with postgresql:// if needed (but don't touch postgresql://)
DB_URL=$(echo "$DB_URL" | sed 's|^postgres://|postgresql://|')

echo "Running prisma db push..."
npx prisma db push --url "$DB_URL" --schema /app/prisma/schema.prisma
echo "Predeploy complete."

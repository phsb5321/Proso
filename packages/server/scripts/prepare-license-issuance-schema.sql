-- SPDX-License-Identifier: AGPL-3.0-or-later
-- Copyright (c) 2024-2026 Proso Contributors. All rights reserved.
-- Commercial licensing: https://proso.com.br/commercial
--
-- Idempotent bridge for deployments created before this repository tracked
-- Prisma migrations. It applies only Feature 148's additive columns and unique
-- indexes, then the normal `prisma db push` reconciles the complete schema.
-- Unique-index creation is deliberately fail-closed: contradictory duplicate
-- rows abort the transaction and must be investigated, never deleted here.

DO $proso$
BEGIN
  IF to_regclass('"Subscription"') IS NOT NULL THEN
    ALTER TABLE "Subscription"
      ADD COLUMN IF NOT EXISTS "paddleTransactionId" TEXT,
      ADD COLUMN IF NOT EXISTS "licenseClaimHash" TEXT;

    CREATE UNIQUE INDEX IF NOT EXISTS "Subscription_paddleTransactionId_key"
      ON "Subscription"("paddleTransactionId");
  END IF;

  IF to_regclass('"LicenseKey"') IS NOT NULL THEN
    CREATE UNIQUE INDEX IF NOT EXISTS "LicenseKey_userId_key"
      ON "LicenseKey"("userId");
  END IF;
END
$proso$;

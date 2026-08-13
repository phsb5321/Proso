-- SPDX-License-Identifier: AGPL-3.0-or-later
-- Copyright (c) 2024-2026 Proso Contributors. All rights reserved.
-- Commercial licensing: https://proso.com.br/commercial
--
-- Idempotent bridge for deployments created before this repository tracked
-- Prisma migrations. It applies the additive/nullable licence and Paddle
-- provisioning columns, tables, constraints, and unique indexes before normal
-- `prisma db push` reconciles the complete schema.
-- Unique-index creation is deliberately fail-closed: contradictory duplicate
-- rows abort the transaction and must be investigated, never deleted here.

DO $proso$
BEGIN
  IF to_regclass('"User"') IS NOT NULL THEN
    ALTER TABLE "User"
      ALTER COLUMN "licenseKey" DROP NOT NULL,
      ADD COLUMN IF NOT EXISTS "paddleCustomerId" TEXT;

    CREATE UNIQUE INDEX IF NOT EXISTS "User_paddleCustomerId_key"
      ON "User"("paddleCustomerId");
  END IF;

  IF to_regclass('"Subscription"') IS NOT NULL THEN
    ALTER TABLE "Subscription"
      ADD COLUMN IF NOT EXISTS "paddleTransactionId" TEXT,
      ADD COLUMN IF NOT EXISTS "licenseClaimHash" TEXT,
      ADD COLUMN IF NOT EXISTS "paddleLastTransactionId" TEXT,
      ADD COLUMN IF NOT EXISTS "paddleOccurredAt" TIMESTAMP(3),
      ADD COLUMN IF NOT EXISTS "paddleEventType" TEXT,
      ADD COLUMN IF NOT EXISTS "paddleEventId" TEXT;

    CREATE UNIQUE INDEX IF NOT EXISTS "Subscription_paddleTransactionId_key"
      ON "Subscription"("paddleTransactionId");

    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'Subscription_paddle_claim_pair_check'
    ) THEN
      ALTER TABLE "Subscription"
        ADD CONSTRAINT "Subscription_paddle_claim_pair_check"
        CHECK (("paddleTransactionId" IS NULL) = ("licenseClaimHash" IS NULL));
    END IF;
  END IF;

  IF to_regclass('"CreditAllocation"') IS NOT NULL THEN
    ALTER TABLE "CreditAllocation"
      ADD COLUMN IF NOT EXISTS "paddleTransactionId" TEXT;

    CREATE UNIQUE INDEX IF NOT EXISTS "CreditAllocation_paddleTransactionId_key"
      ON "CreditAllocation"("paddleTransactionId");
  END IF;

  IF to_regclass('"PaddleWebhookEvent"') IS NULL THEN
    CREATE TABLE "PaddleWebhookEvent" (
      "eventId" TEXT NOT NULL,
      "eventType" TEXT NOT NULL,
      "occurredAt" TIMESTAMP(3) NOT NULL,
      "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "PaddleWebhookEvent_pkey" PRIMARY KEY ("eventId")
    );
  END IF;

  IF to_regclass('"LicenseKey"') IS NOT NULL THEN
    CREATE UNIQUE INDEX IF NOT EXISTS "LicenseKey_userId_key"
      ON "LicenseKey"("userId");
  END IF;
END
$proso$;

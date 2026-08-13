import { registerAs } from '@nestjs/config';
import { hasStrongLicenseKeySecret } from '../../core/subscription/license-key';

/**
 * Required environment variables in production.
 * The server will refuse to start if any of these are missing or empty.
 */
// LICENSE_KEY_SECRET deterministically re-derives customer-facing keys while
// storing only their hashes. A production process without a strong secret must
// stop before it can expose an issuance endpoint that can never succeed.
const REQUIRED_IN_PRODUCTION = ['DATABASE_URL', 'JWT_SECRET', 'LICENSE_KEY_SECRET'] as const;

function validateProductionEnv(): void {
  if (process.env.NODE_ENV !== 'production') return;

  const missing = REQUIRED_IN_PRODUCTION.filter((key) => !process.env[key]?.trim());

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables in production: ${missing.join(', ')}. ` +
        'Refusing to start with insecure defaults.',
    );
  }

  if (!hasStrongLicenseKeySecret(process.env.LICENSE_KEY_SECRET ?? '')) {
    throw new Error('LICENSE_KEY_SECRET must contain at least 32 bytes in production.');
  }
}

// Validate on module load — crashes before NestFactory.create()
validateProductionEnv();

export default registerAs('app', () => ({
  port: parseInt(process.env.PORT || '5000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',

  // Database
  databaseUrl: process.env.DATABASE_URL || '',

  // Redis
  redisUrl: process.env.REDIS_URL || '',

  // Auth
  jwtSecret: process.env.JWT_SECRET || '',

  // License key derivation (HMAC secret; see core/subscription/license-key.ts)
  licenseKeySecret: process.env.LICENSE_KEY_SECRET || '',

  // Paddle billing. Values stay empty until sandbox/live configuration is
  // supplied; webhook processing then fails closed rather than inventing ids.
  paddleWebhookSecret: process.env.PADDLE_WEBHOOK_SECRET || '',
  paddlePriceProMonthly: process.env.PADDLE_PRICE_PRO_MONTHLY || '',
  paddlePriceProYearly: process.env.PADDLE_PRICE_PRO_YEARLY || '',
  paddlePriceEnterpriseMonthly: process.env.PADDLE_PRICE_ENTERPRISE_MONTHLY || '',
  paddlePriceEnterpriseYearly: process.env.PADDLE_PRICE_ENTERPRISE_YEARLY || '',

  // TTS providers
  openaiApiKey: process.env.OPENAI_API_KEY || '',
  elevenlabsApiKey: process.env.ELEVENLABS_API_KEY || '',
  groqApiKey: process.env.GROQ_API_KEY || '',

  // Logging
  logLevel: process.env.LOG_LEVEL || 'info',
  lokiHost: process.env.LOKI_HOST || '',
}));

import * as Sentry from '@sentry/nestjs';

// Imported first in main.ts so @sentry/nestjs auto-instrumentation is in place
// before Nest bootstraps. A no-op when SENTRY_DSN is unset (local/dev), so it is
// safe to import unconditionally. DSN + environment come from the dokku config.
Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV ?? 'production',
  tracesSampleRate: 0,
});

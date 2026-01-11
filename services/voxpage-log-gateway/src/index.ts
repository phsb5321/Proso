/**
 * VoxPage Log Gateway
 *
 * Express server that receives telemetry events from the VoxPage extension
 * and pushes them to Loki for storage and querying.
 *
 * Architecture:
 *   Extension → POST /ingest → Gateway → Loki /loki/api/v1/push
 *
 * Environment Variables:
 *   PORT            - Server port (default: 3000)
 *   GATEWAY_TOKEN   - Bearer token for authenticating extension requests
 *   LOKI_URL        - Loki push API URL (default: http://loki.web.1:3100)
 *   LOKI_USER       - Optional Loki basic auth username
 *   LOKI_PASSWORD   - Optional Loki basic auth password
 *   RATE_LIMIT_RPM  - Requests per minute per IP (default: 60)
 *   NODE_ENV        - Environment (development/production)
 */

import express, { type Request, type Response, type NextFunction } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import pino from 'pino';
import pinoHttp from 'pino-http';

import {
  IngestRequestSchema,
  type ValidationErrorResponse,
  type GatewayErrorResponse,
} from './schemas.js';
import { LokiClient } from './loki-client.js';

// ============================================================================
// Configuration
// ============================================================================

const config = {
  port: parseInt(process.env.PORT || '3000', 10),
  gatewayToken: process.env.GATEWAY_TOKEN || '',
  lokiUrl: process.env.LOKI_URL || 'http://loki.web.1:3100',
  lokiUser: process.env.LOKI_USER,
  lokiPassword: process.env.LOKI_PASSWORD,
  environment: (process.env.NODE_ENV === 'production' ? 'prod' : 'dev') as
    | 'dev'
    | 'staging'
    | 'prod',
  rateLimitRpm: parseInt(process.env.RATE_LIMIT_RPM || '60', 10),
  isDev: process.env.NODE_ENV !== 'production',
};

// ============================================================================
// Logger
// ============================================================================

const logger = pino({
  level: config.isDev ? 'debug' : 'info',
  transport: config.isDev ? { target: 'pino-pretty' } : undefined,
});

// ============================================================================
// Loki Client
// ============================================================================

const lokiClient = new LokiClient({
  lokiUrl: config.lokiUrl,
  lokiUser: config.lokiUser,
  lokiPassword: config.lokiPassword,
  environment: config.environment,
});

// ============================================================================
// Express App
// ============================================================================

const app = express();

// Security headers
app.use(helmet());

// CORS - allow extension requests
app.use(
  cors({
    origin: true, // Allow all origins (extension will use bearer token)
    methods: ['POST', 'GET'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  }),
);

// Request logging
app.use(pinoHttp({ logger, autoLogging: { ignore: (req) => req.url === '/health' } }));

// Body parsing with size limit
app.use(express.json({ limit: '1mb' }));

// Rate limiting
const limiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: config.rateLimitRpm,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'rate_limited', retryAfter: 60 },
  keyGenerator: (req) => {
    // Use X-Forwarded-For for clients behind proxy, fall back to IP
    return (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.ip || 'unknown';
  },
});

// ============================================================================
// Auth Middleware
// ============================================================================

/**
 * Constant-time string comparison to prevent timing attacks.
 * Returns true if strings are equal, false otherwise.
 */
function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    // Still do a dummy comparison to maintain constant time
    let result = 0;
    for (let i = 0; i < a.length; i++) {
      result |= a.charCodeAt(i) ^ a.charCodeAt(i);
    }
    return false;
  }

  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  // Skip auth in development if no token configured
  if (config.isDev && !config.gatewayToken) {
    next();
    return;
  }

  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    res
      .status(401)
      .json({ error: 'unauthorized', message: 'Missing or invalid Authorization header' });
    return;
  }

  const token = authHeader.slice(7);
  if (!constantTimeEqual(token, config.gatewayToken)) {
    res.status(401).json({ error: 'unauthorized', message: 'Invalid token' });
    return;
  }

  next();
}

// ============================================================================
// Routes
// ============================================================================

/**
 * Health check endpoint
 * Used by Dokku/Docker for container health monitoring
 */
app.get('/health', async (_req: Request, res: Response) => {
  const lokiHealthy = await lokiClient.healthCheck();

  if (lokiHealthy) {
    res.json({
      status: 'healthy',
      loki: 'connected',
      timestamp: new Date().toISOString(),
    });
  } else {
    res.status(503).json({
      status: 'degraded',
      loki: 'unavailable',
      timestamp: new Date().toISOString(),
    });
  }
});

/**
 * Ingest endpoint
 * Receives batched events from the extension and pushes to Loki
 */
app.post('/ingest', limiter, authMiddleware, async (req: Request, res: Response) => {
  // Validate request body
  const parseResult = IngestRequestSchema.safeParse(req.body);

  if (!parseResult.success) {
    const errorResponse: ValidationErrorResponse = {
      error: 'validation_error',
      details: parseResult.error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      })),
    };
    res.status(400).json(errorResponse);
    return;
  }

  const { events } = parseResult.data;

  // Push to Loki
  const result = await lokiClient.push(events);

  if (result.success) {
    logger.info({ eventsAccepted: result.eventsAccepted }, 'Events ingested successfully');
    res.status(200).json({ accepted: result.eventsAccepted });
  } else {
    logger.error({ error: result.error }, 'Failed to push to Loki');
    const errorResponse: GatewayErrorResponse = {
      error: 'loki_unavailable',
      message: result.error || 'Failed to push events to Loki',
    };
    res.status(502).json(errorResponse);
  }
});

/**
 * 404 handler
 */
app.use((_req: Request, res: Response) => {
  res.status(404).json({ error: 'not_found' });
});

/**
 * Error handler
 */
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  logger.error({ err }, 'Unhandled error');
  res.status(500).json({ error: 'internal_error', message: 'An unexpected error occurred' });
});

// ============================================================================
// Server Startup
// ============================================================================

async function start(): Promise<void> {
  // Validate configuration
  if (!config.isDev && !config.gatewayToken) {
    logger.error('GATEWAY_TOKEN is required in production');
    process.exit(1);
  }

  // Check Loki connectivity
  const lokiHealthy = await lokiClient.healthCheck();
  if (!lokiHealthy) {
    logger.warn({ lokiUrl: config.lokiUrl }, 'Loki is not reachable - will retry on requests');
  } else {
    logger.info({ lokiUrl: config.lokiUrl }, 'Loki connection verified');
  }

  // Start server
  app.listen(config.port, () => {
    logger.info(
      {
        port: config.port,
        lokiUrl: config.lokiUrl,
        rateLimitRpm: config.rateLimitRpm,
        authEnabled: !!config.gatewayToken,
      },
      'VoxPage Log Gateway started',
    );
  });
}

start().catch((err) => {
  logger.error({ err }, 'Failed to start server');
  process.exit(1);
});

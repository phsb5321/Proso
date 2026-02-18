import { registerAs } from '@nestjs/config';

export default registerAs('app', () => ({
  port: parseInt(process.env.PORT || '5000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',

  // Database
  databaseUrl: process.env.DATABASE_URL || '',

  // Redis
  redisUrl: process.env.REDIS_URL || '',

  // Auth
  jwtSecret: process.env.JWT_SECRET || '',

  // Paddle billing
  paddleApiKey: process.env.PADDLE_API_KEY || '',
  paddleWebhookSecret: process.env.PADDLE_WEBHOOK_SECRET || '',

  // TTS providers
  openaiApiKey: process.env.OPENAI_API_KEY || '',
  elevenlabsApiKey: process.env.ELEVENLABS_API_KEY || '',
  groqApiKey: process.env.GROQ_API_KEY || '',

  // Logging
  logLevel: process.env.LOG_LEVEL || 'info',
  lokiHost: process.env.LOKI_HOST || '',
}));

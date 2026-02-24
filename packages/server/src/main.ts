import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    rawBody: true,
    bufferLogs: true,
  });

  // Use Pino logger globally
  app.useLogger(app.get(Logger));

  // Trust proxy for Dokku/nginx
  app.getHttpAdapter().getInstance().set('trust proxy', true);

  // CORS for extension communication
  app.enableCors({
    origin: true,
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type', 'X-License-Key'],
  });

  const port = process.env.PORT || 5000;
  await app.listen(port);

  const logger = app.get(Logger);
  logger.log(`Proso API server listening on port ${port}`);
}

bootstrap();

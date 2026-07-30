import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { LoggerModule } from 'nestjs-pino';
import { PinoLoggerAdapter } from '../../adapters/logging/pino-logger.adapter';
import { LoggerPort } from '../../ports/logger.port';

@Module({
  imports: [
    LoggerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const isProduction = config.get('app.nodeEnv') === 'production';
        const lokiHost = config.get<string>('app.lokiHost');

        const transport = isProduction
          ? lokiHost
            ? {
                target: 'pino-loki',
                options: {
                  host: lokiHost,
                  labels: { app: 'proso-api' },
                  batching: true,
                  interval: 5,
                },
              }
            : undefined
          : {
              target: 'pino-pretty',
              options: { colorize: true },
            };

        return {
          pinoHttp: {
            level: config.get('app.logLevel') || 'info',
            transport,
            autoLogging: {
              ignore: (req: { url?: string }) => req.url === '/health',
            },
            serializers: {
              req: (req: { method?: string; url?: string }) => ({
                method: req.method,
                url: req.url,
              }),
              res: (res: { statusCode?: number }) => ({
                statusCode: res.statusCode,
              }),
            },
          },
        };
      },
    }),
  ],
  providers: [PinoLoggerAdapter, { provide: LoggerPort, useExisting: PinoLoggerAdapter }],
  exports: [LoggerPort],
})
export class LoggingModule {}

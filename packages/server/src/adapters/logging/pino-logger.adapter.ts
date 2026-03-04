import { Injectable } from '@nestjs/common';
import type { PinoLogger } from 'nestjs-pino';
import { LoggerPort } from '../../ports/logger.port';

@Injectable()
export class PinoLoggerAdapter extends LoggerPort {
  constructor(private readonly pino: PinoLogger) {
    super();
  }

  info(message: string, context?: Record<string, unknown>): void {
    this.pino.info(context || {}, message);
  }

  warn(message: string, context?: Record<string, unknown>): void {
    this.pino.warn(context || {}, message);
  }

  error(message: string, context?: Record<string, unknown>): void {
    this.pino.error(context || {}, message);
  }

  debug(message: string, context?: Record<string, unknown>): void {
    this.pino.debug(context || {}, message);
  }
}

// Logger port — abstract class for NestJS DI token (survives TS compilation)
// ZERO NestJS imports in this file

export abstract class LoggerPort {
  abstract info(message: string, context?: Record<string, unknown>): void;
  abstract warn(message: string, context?: Record<string, unknown>): void;
  abstract error(message: string, context?: Record<string, unknown>): void;
  abstract debug(message: string, context?: Record<string, unknown>): void;
}

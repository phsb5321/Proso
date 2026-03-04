import { Controller, Get } from '@nestjs/common';
import { HealthCheck, type HealthCheckService, type MemoryHealthIndicator } from '@nestjs/terminus';
import type { PrismaHealthIndicator } from '../health/prisma.health';

// Read version from package.json at startup
const APP_VERSION = process.env.npm_package_version || '1.0.0';
const startTime = Date.now();

@Controller('health')
export class HealthController {
  constructor(
    private health: HealthCheckService,
    private memory: MemoryHealthIndicator,
    private prisma: PrismaHealthIndicator,
  ) {}

  @Get()
  @HealthCheck()
  async check() {
    const result = await this.health.check([
      () => this.prisma.isHealthy('database'),
      () => this.memory.checkHeap('memory', 256 * 1024 * 1024), // 256MB
    ]);

    return {
      status: result.status,
      version: APP_VERSION,
      uptime: Math.floor((Date.now() - startTime) / 1000),
      details: result.details,
    };
  }
}

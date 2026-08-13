import { Controller, Get } from '@nestjs/common';
import { HealthCheck, HealthCheckService, MemoryHealthIndicator } from '@nestjs/terminus';
import { PrismaHealthIndicator } from '../health/prisma.health';

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

    // Runtime revision, sourced ONLY from process configuration (Dokku injects
    // GIT_REV into the container). Never derived from request input and never
    // from `version`, which is a semantic product version and cannot identify
    // a deployment. Null means the platform did not supply a revision;
    // deploy verification must fail closed on null, not fall back to `version`.
    const revision = process.env.GIT_REV?.trim() || null;

    return {
      status: result.status,
      version: APP_VERSION,
      revision,
      uptime: Math.floor((Date.now() - startTime) / 1000),
      details: result.details,
    };
  }
}

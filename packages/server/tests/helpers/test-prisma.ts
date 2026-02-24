import { execSync } from 'node:child_process';
import path from 'node:path';
/**
 * Test PrismaService factory for contract/integration tests.
 *
 * Spins up a PostgreSQL container via testcontainers,
 * applies the schema via `prisma db push`, and returns
 * a PrismaService instance connected to the test database.
 */
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { PrismaService } from '../../src/infrastructure/modules/prisma.module';

let container: StartedPostgreSqlContainer | null = null;
let prismaService: PrismaService | null = null;

/**
 * Start a PostgreSQL testcontainer and return a connected PrismaService.
 * Reuses the same container across calls within a test suite.
 */
export async function createTestPrismaService(): Promise<PrismaService> {
  if (prismaService) return prismaService;

  // Start PostgreSQL container
  container = await new PostgreSqlContainer('postgres:16-alpine')
    .withDatabase('proso_test')
    .withUsername('test')
    .withPassword('test')
    .start();

  const connectionString = container.getConnectionUri();

  // Apply schema via prisma db push (Prisma 7 no longer has --skip-generate)
  const schemaPath = path.resolve(__dirname, '../../prisma/schema.prisma');
  execSync(`npx prisma db push --url "${connectionString}" --schema "${schemaPath}"`, {
    cwd: path.resolve(__dirname, '../..'),
    stdio: 'pipe',
    env: { ...process.env, DATABASE_URL: connectionString },
  });

  // Create PrismaService with test connection
  process.env.DATABASE_URL = connectionString;
  prismaService = new PrismaService();
  await prismaService.onModuleInit();

  return prismaService;
}

/**
 * Get the connection URI for the running test container.
 */
export function getTestConnectionUri(): string {
  if (!container)
    throw new Error('Test container not started. Call createTestPrismaService() first.');
  return container.getConnectionUri();
}

/**
 * Clean up all data from tables (preserving schema).
 * Call this in afterEach to ensure test isolation.
 */
export async function cleanupTestData(prisma: PrismaService): Promise<void> {
  // Delete in FK-safe order (children first)
  await prisma.routingDecision.deleteMany();
  await prisma.creditTransaction.deleteMany();
  await prisma.tTSRequest.deleteMany();
  await prisma.creditAllocation.deleteMany();
  await prisma.licenseKey.deleteMany();
  await prisma.subscription.deleteMany();
  await prisma.user.deleteMany();
}

/**
 * Tear down the test container and disconnect PrismaService.
 * Call this in afterAll.
 */
export async function teardownTestPrisma(): Promise<void> {
  if (prismaService) {
    await prismaService.$disconnect();
    prismaService = null;
  }
  if (container) {
    await container.stop();
    container = null;
  }
}

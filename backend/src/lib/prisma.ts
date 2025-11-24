import { PrismaClient } from '@prisma/client';

/**
 * Singleton Prisma Client instance
 *
 * Benefits:
 * - Single connection pool shared across all services
 * - Prevents connection pool exhaustion
 * - Reduces memory overhead (~50MB per eliminated instance)
 * - Better connection reuse and performance
 *
 * Configuration:
 * - Connection pool sized appropriately for production load
 * - Query logging enabled in development for debugging
 * - Error logging always enabled for observability
 */

declare global {
  // eslint-disable-next-line no-var
  var prisma: PrismaClient | undefined;
}

const isProd = process.env.NODE_ENV === 'production';

export const prisma =
  global.prisma ||
  new PrismaClient({
    log: isProd
      ? ['error', 'warn']
      : ['query', 'error', 'warn'],
    datasources: {
      db: {
        url: process.env.DATABASE_URL,
      },
    },
  });

// In development, preserve instance across hot reloads
if (!isProd) {
  global.prisma = prisma;
}

/**
 * Graceful shutdown handler
 * Ensures database connections are properly closed on application termination
 */
async function gracefulShutdown(signal: string) {
  console.log(`\n${signal} received. Closing database connections...`);
  await prisma.$disconnect();
  console.log('Database connections closed successfully.');
  process.exit(0);
}

// Register shutdown handlers for various termination signals
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGUSR2', () => gracefulShutdown('SIGUSR2')); // nodemon restart

// Handle uncaught errors
process.on('beforeExit', async () => {
  await prisma.$disconnect();
});

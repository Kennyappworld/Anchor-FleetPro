/**
 * Singleton Prisma client — one instance shared across the entire app.
 * Prevents "too many connections" under load.
 */
const { PrismaClient } = require('@prisma/client');

// Always use the global singleton — in production Node.js module cache handles this,
// but the global ensures it works even if modules are re-required.
if (!global._prisma) {
  global._prisma = new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });
}

module.exports = global._prisma;

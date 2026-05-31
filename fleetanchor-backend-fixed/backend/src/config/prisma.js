const { PrismaClient } = require('@prisma/client');

if (!global._prisma) {
  global._prisma = new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
    errorFormat: 'minimal',
  });
}

module.exports = global._prisma;

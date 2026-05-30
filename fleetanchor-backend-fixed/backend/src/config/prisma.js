const path = require('path');
const clientPath = path.join(__dirname, '../../prisma/generated/client');

let PrismaClient;
try {
  PrismaClient = require(clientPath).PrismaClient;
} catch(e) {
  // Fallback to default location
  PrismaClient = require('@prisma/client').PrismaClient;
}

if (!global._prisma) {
  global._prisma = new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
    errorFormat: 'minimal',
  });
}

module.exports = global._prisma;

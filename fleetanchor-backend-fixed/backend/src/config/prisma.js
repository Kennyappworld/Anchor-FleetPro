let _client = null;

function getClient() {
  if (!_client) {
    const { PrismaClient } = require('@prisma/client');
    _client = new PrismaClient({
      log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
      errorFormat: 'minimal',
    });
  }
  return _client;
}

// Return proxy that lazy-loads on first method call
module.exports = new Proxy({}, {
  get(_, prop) {
    return getClient()[prop];
  }
});

const { execSync } = require('child_process');

try {
  console.log('Syncing database schema...');
  execSync('npx prisma db push --accept-data-loss --skip-generate', { 
    stdio: 'inherit', 
    timeout: 60000 
  });
  console.log('Database ready.');
} catch (err) {
  console.error('DB push failed (continuing):', err.message);
}

// Now start the actual server
require('./server.js');

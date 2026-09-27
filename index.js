const fs = require('fs');
const path = require('path');

// Ensure dist/server.js exists before loading
const distPath = path.join(__dirname, 'dist', 'server.js');
if (!fs.existsSync(distPath)) {
  console.log('dist/server.js not found. Running TypeScript compilation...');
  require('child_process').execSync('npx tsc', { stdio: 'inherit' });
}

require(distPath);


const serverless = require('serverless-http');
const path = require('path');
const fs = require('fs');

// Set NETLIFY environment variable before requiring server
process.env.NETLIFY = 'true';

// Try to find and set public directory path before server loads
// In Netlify, files might be in different locations
const possiblePublicPaths = [
  path.join(__dirname, 'public'),              // Function directory (if copied)
  path.join(__dirname, '..', '..', 'public'),  // Project root
  path.join(process.cwd(), 'public'),          // Working directory
  '/var/task/public',                          // Netlify Lambda default
  '/var/task/src/public',                      // Netlify Lambda with src
];

for (const publicPath of possiblePublicPaths) {
  if (fs.existsSync(publicPath) && fs.existsSync(path.join(publicPath, 'landing.html'))) {
    // Set environment variable that server.js can use
    process.env.PUBLIC_DIR = publicPath;
    break;
  }
}

const app = require('../../server');

// Export the Express app wrapped in serverless-http
module.exports.handler = serverless(app);


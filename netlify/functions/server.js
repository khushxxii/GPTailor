const serverless = require('serverless-http');
const app = require('../../server');

// Export the Express app wrapped in serverless-http
module.exports.handler = serverless(app);


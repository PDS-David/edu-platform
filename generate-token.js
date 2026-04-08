require('dotenv').config(); // MUST be first

const { generateToken } = require('./server/utils/jwt');

const token = generateToken(
  'a7f89b4e-d3f2-4955-8227-bd5bd60f409a',
  'student'
);

console.log('NEW TOKEN:\n', token);
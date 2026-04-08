require('dotenv').config(); // Add this
const { generateToken } = require('./utils/jwt');

const token = generateToken({
  id: 'a7f89b4e-d3f2-4955-8227-bd5bd60f409a',
  role: 'student'
});

console.log(token);
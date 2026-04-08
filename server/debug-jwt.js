require('dotenv').config();
const jwt = require('jsonwebtoken');

const token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6ImE3Zjg5YjRlLWQzZjItNDk1NS04MjI3LWJkNWJkNjBmNDA5YSIsInJvbGUiOiJzdHVkZW50IiwiaWF0IjoxNzc1NTk4MzMxLCJleHAiOjE3NzYyMDMxMzEsImlzcyI6ImVkdS1wbGF0Zm9ybSJ9.DG91hSfBkRV371p2MplQtdvRPjeCkKqjT6kElxZ4ULE";

try {
  const decoded = jwt.verify(token, process.env.JWT_SECRET);
  console.log("VALID TOKEN ✅");
  console.log(decoded);
} catch (err) {
  console.error("INVALID TOKEN ❌");
  console.error(err.message);
}
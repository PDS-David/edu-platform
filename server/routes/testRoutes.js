// server/routes/testRoutes.js
// ─────────────────────────────────────────────────────────────────────────────
// INTENTIONALLY EMPTY — all test endpoints have been migrated:
//
//   POST /api/teacher/tests               → server/routes/teacherRoutes.js
//   GET  /api/student/tests               → server/routes/studentRoutes.js
//   GET  /api/student/test/:testId        → server/routes/studentRoutes.js
//   POST /api/student/test/:testId/submit → server/routes/studentRoutes.js
//
// This file is kept so the require() in server.js does not throw.
// The router it exports has no routes, so mounting it at /api is a no-op.
//
// BUG FIXED: Previously this file re-declared all four routes, causing Express
// to register each path twice. Because server.js mounts testRoutes last
// (app.use('/api', testRoutes)), these duplicate handlers would be reached by
// any request that fell through the primary routers, serving the old broken
// implementations. Emptying this file eliminates the collision entirely.
// ─────────────────────────────────────────────────────────────────────────────

const express = require('express');
const router  = express.Router();

module.exports = router;

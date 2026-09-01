// server/middleware/agentServiceAuth.js
//
// Authenticates server-to-server callers of POST /agent/generate — the
// shared AI hub endpoint that lets other backends (currently sts-school-app)
// use this app's services/ai.js generate() instead of running their own
// duplicate Gemini integration.
//
// This is NOT the same as `protect` (server/middleware/auth.js), which
// authenticates logged-in school users via JWT. There is no logged-in user
// here — the caller is another backend, authenticated with a static shared
// secret instead.
//
// How it works:
//   Reads AI_AGENT_SERVICE_KEY from .env. The caller must send the same
//   value in the X-Api-Key header on every request.
//
// UNLIKE ipWhitelist.js, this fails CLOSED, not open, when unconfigured:
// ipWhitelist protects a route that's otherwise reachable only by an
// already-authenticated admin (protect + authorize('admin') run first), so
// an empty whitelist in dev is a reasonable default. This route has no such
// first layer — it's reachable by anyone who can reach this server at all —
// so an unset key must mean "endpoint disabled," never "endpoint open."
//
// .env example:
//   AI_AGENT_SERVICE_KEY=<a long random string, shared with sts-school-app>
//
// Applied in server.js:
//   app.use('/agent', agentServiceAuth, agentServiceLimiter, agentServiceRoutes);

const CONFIGURED_KEY = process.env.AI_AGENT_SERVICE_KEY || '';

if (CONFIGURED_KEY) {
  console.log('[agentServiceAuth] Shared agent service endpoint active.');
} else {
  console.warn(
    '[agentServiceAuth] AI_AGENT_SERVICE_KEY is not set — POST /agent/generate ' +
    'will reject every request with 503 until it is configured. This is ' +
    'intentional (fail closed), not a bug.'
  );
}

module.exports = function agentServiceAuth(req, res, next) {
  if (!CONFIGURED_KEY) {
    return res.status(503).json({
      success: false,
      error: 'Shared agent service is not configured on this server.',
    });
  }

  const providedKey = req.headers['x-api-key'];

  if (!providedKey || providedKey !== CONFIGURED_KEY) {
    console.warn('[agentServiceAuth] Rejected request with missing/invalid X-Api-Key.');
    return res.status(401).json({
      success: false,
      error: 'Invalid or missing X-Api-Key.',
    });
  }

  return next();
};

// server/middleware/ipWhitelist.js
//
// Restricts /api/admin routes to specific IP addresses.
//
// How it works:
//   Reads ADMIN_WHITELIST_IPS from .env (comma-separated list of IPs).
//   If the list is empty or not set, the whitelist is DISABLED so you
//   can develop locally without configuring IPs first.
//   Once you add real IPs, only those addresses can reach admin routes.
//
// How to find your IP: visit https://whatismyipaddress.com
//
// .env example:
//   ADMIN_WHITELIST_IPS=105.112.10.44,102.89.23.11
//
// Applied in server.js:
//   app.use('/api/admin', protect, authorize('admin'), ipWhitelist, adminRoutes);

const ADMIN_WHITELIST = (process.env.ADMIN_WHITELIST_IPS || '')
  .split(',')
  .map(ip => ip.trim())
  .filter(Boolean);

if (ADMIN_WHITELIST.length > 0) {
  console.log(`🔒 Admin IP whitelist active: ${ADMIN_WHITELIST.join(', ')}`);
} else {
  console.warn('⚠️  ADMIN_WHITELIST_IPS not set — admin routes are IP-unrestricted');
}

module.exports = function ipWhitelist(req, res, next) {
  // Whitelist disabled in development when env var is empty
  if (ADMIN_WHITELIST.length === 0) return next();

  // Support Nginx reverse proxy (X-Forwarded-For) and direct connections
  const clientIp =
    (req.headers['x-forwarded-for'] || '').split(',')[0].trim() ||
    req.socket?.remoteAddress ||
    '';

  // Strip the IPv6-mapped IPv4 prefix so ::ffff:127.0.0.1 matches 127.0.0.1
  const normalizedIp = clientIp.replace(/^::ffff:/, '');

  if (ADMIN_WHITELIST.includes(normalizedIp)) {
    return next();
  }

  console.warn(`[ipWhitelist] Blocked admin access from IP: ${normalizedIp}`);
  return res.status(403).json({
    success: false,
    error: 'Access denied. Your IP address is not authorised for admin access.',
  });
};

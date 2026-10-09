const { rateLimit } = require('express-rate-limit');

function createRouteLimit({ windowMs = 60_000, limit = 120 } = {}) {
  return rateLimit({ windowMs, limit, standardHeaders: true, legacyHeaders: false });
}

module.exports = { createRouteLimit };

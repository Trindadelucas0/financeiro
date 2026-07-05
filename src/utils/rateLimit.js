const rateLimit = require('express-rate-limit');

const rateLimitDefaults = {
  standardHeaders: true,
  legacyHeaders: false,
  validate: { xForwardedForHeader: false },
};

function createRateLimit(options) {
  return rateLimit({ ...rateLimitDefaults, ...options });
}

module.exports = { createRateLimit };

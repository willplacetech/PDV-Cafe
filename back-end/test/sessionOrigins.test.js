const test = require('node:test');
const assert = require('node:assert/strict');
const { allowedOrigins, trustedOrigin } = require('../utils/sessionOrigins');

test('permite a origem do frontend de delivery em produção', () => {
  const previousNodeEnv = process.env.NODE_ENV;
  const previousFrontendUrl = process.env.FRONTEND_URL;
  process.env.NODE_ENV = 'production';
  delete process.env.FRONTEND_URL;

  try {
    const origin = 'https://pdv-delivery-9j0a.onrender.com';
    assert.ok(allowedOrigins().includes(origin));
    assert.equal(trustedOrigin({ headers: { origin } }), true);
    assert.equal(trustedOrigin({ headers: { origin: 'https://attacker.example' } }), false);
  } finally {
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousNodeEnv;
    if (previousFrontendUrl === undefined) delete process.env.FRONTEND_URL;
    else process.env.FRONTEND_URL = previousFrontendUrl;
  }
});

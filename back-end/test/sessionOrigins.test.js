const test = require('node:test');
const assert = require('node:assert/strict');
const { allowedOrigins, trustedOrigin } = require('../utils/sessionOrigins');

test('permite somente as duas origens configuradas em qualquer ambiente', () => {
  const previousNodeEnv = process.env.NODE_ENV;
  const previousFrontendUrl = process.env.FRONTEND_URL;

  try {
    process.env.FRONTEND_URL = 'https://attacker.example';
    const permittedOrigins = [
      'https://restaurante-pdv.onrender.com',
      'https://restaurante-pdv-back.onrender.com',
    ];

    for (const environment of ['production', 'development']) {
      process.env.NODE_ENV = environment;
      assert.deepEqual(allowedOrigins(), permittedOrigins);
      for (const origin of permittedOrigins) {
        assert.equal(trustedOrigin({ headers: { origin } }), true);
      }
      for (const origin of [
        'https://pdv-delivery-9j0a.onrender.com',
        'https://attacker.example',
        'http://localhost:5173',
      ]) {
        assert.equal(trustedOrigin({ headers: { origin } }), false);
      }
    }
  } finally {
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousNodeEnv;
    if (previousFrontendUrl === undefined) delete process.env.FRONTEND_URL;
    else process.env.FRONTEND_URL = previousFrontendUrl;
  }
});

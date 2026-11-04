const test = require('node:test');
const assert = require('node:assert/strict');
const { allowedOrigins, trustedOrigin } = require('../utils/sessionOrigins');

test('permite somente as origens próprias configuradas em qualquer ambiente', () => {
  const previousNodeEnv = process.env.NODE_ENV;
  const previousFrontendUrl = process.env.FRONTEND_URL;
  const previousCorsExtras = process.env.CORS_EXTRA_ORIGINS;

  try {
    process.env.FRONTEND_URL = 'https://restaurante-pdv.onrender.com,https://restaurante-pdv-back.onrender.com';
    delete process.env.CORS_EXTRA_ORIGINS;
    const permittedOrigins = [
      'https://restaurante-pdv.onrender.com',
      'https://restaurante-pdv-back.onrender.com',
    ];
    const developmentOrigins = [
      'http://localhost:5173',
      'http://127.0.0.1:5173',
      'http://localhost:4173',
      'http://127.0.0.1:4173',
    ];

    for (const environment of ['production', 'development']) {
      process.env.NODE_ENV = environment;
      const expectedOrigins = environment === 'development'
        ? [...permittedOrigins, ...developmentOrigins]
        : permittedOrigins;
      assert.deepEqual(allowedOrigins(), expectedOrigins);
      for (const origin of permittedOrigins) {
        assert.equal(trustedOrigin({ headers: { origin } }), true);
      }
      for (const origin of developmentOrigins) {
        assert.equal(trustedOrigin({ headers: { origin } }), environment === 'development');
      }
      for (const origin of [
        'https://pdv-delivery-9j0a.onrender.com',
        'https://attacker.example',
      ]) {
        assert.equal(trustedOrigin({ headers: { origin } }), false);
      }
    }
  } finally {
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousNodeEnv;
    if (previousFrontendUrl === undefined) delete process.env.FRONTEND_URL;
    else process.env.FRONTEND_URL = previousFrontendUrl;
    if (previousCorsExtras === undefined) delete process.env.CORS_EXTRA_ORIGINS;
    else process.env.CORS_EXTRA_ORIGINS = previousCorsExtras;
  }
});

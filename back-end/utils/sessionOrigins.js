/**
 * Origens CORS/sessão autorizadas.
 * White-label: use FRONTEND_URL (vírgula) no ambiente; sem lista hard-coded de cliente.
 * localhost liberado em desenvolvimento.
 */
const splitOrigins = (value) => String(value || '')
  .split(',')
  .map((origin) => origin.trim().replace(/\/$/, ''))
  .filter(Boolean);

const devOrigins = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:4173',
  'http://127.0.0.1:4173',
];

const allowedOrigins = () => {
  const fromEnv = splitOrigins(process.env.FRONTEND_URL);
  const extras = splitOrigins(process.env.CORS_EXTRA_ORIGINS);
  const list = [...fromEnv, ...extras];
  if (process.env.NODE_ENV !== 'production') {
    list.push(...devOrigins);
  }
  return [...new Set(list)];
};

const trustedOrigin = (req) => {
  const origin = typeof req?.headers?.origin === 'string'
    ? req.headers.origin.replace(/\/$/, '')
    : '';
  if (!origin) return true;
  return allowedOrigins().includes(origin);
};

const cookieProtection = (req, res, next) => {
  if (!trustedOrigin(req) || req.get('X-CSRF-Protection') !== '1') {
    return res.status(403).json({ msg: 'Origem da sessão não autorizada' });
  }
  return next();
};

const loginProtection = (req, res, next) => {
  if (req?.headers?.origin && !trustedOrigin(req)) {
    return res.status(403).json({ msg: 'Origem da sessão não autorizada' });
  }
  return next();
};

module.exports = { allowedOrigins, trustedOrigin, cookieProtection, loginProtection };

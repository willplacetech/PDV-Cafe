const renderOrigins = ['https://sabordabraco.onrender.com', 'https://saborabraco.onrender.com', 'https://pdv-cafe-web-willplacetech.onrender.com', 'https://pdv-mern-1.onrender.com', 'https://sabordabraco-95pc.onrender.com'];
const allowedOrigins = () => {
  const configured = (process.env.FRONTEND_URL || '').split(',').map(value => value.trim().replace(/\/$/, '')).filter(Boolean);
  const extras = [...renderOrigins, ...(process.env.NODE_ENV === 'production' ? [] : ['http://localhost:5173', 'http://127.0.0.1:5173', 'http://localhost:3000'])];
  const merged = [...new Set([...configured, ...extras])];
  return merged.filter(value => {
    try { return new URL(value).origin === value; } catch { return false; }
  });
};
const trustedOrigin = req => typeof req?.headers?.origin === 'string' && allowedOrigins().includes(req.headers.origin);
const cookieProtection = (req, res, next) => {
  if (!trustedOrigin(req) || req.get('X-CSRF-Protection') !== '1') return res.status(403).json({ msg: 'Origem da sessão não autorizada' });
  return next();
};
const loginProtection = (req, res, next) => {
  if (req?.headers?.origin && !trustedOrigin(req)) return res.status(403).json({ msg: 'Origem da sessão não autorizada' });
  return next();
};
module.exports = { allowedOrigins, trustedOrigin, cookieProtection, loginProtection };

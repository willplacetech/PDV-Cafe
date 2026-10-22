const renderOrigins = ['https://restaurante-pdv.onrender.com', 'https://restaurante-pdv-back.onrender.com'];
const allowedOrigins = () => [...renderOrigins];
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

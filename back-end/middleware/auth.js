const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const User = require('../models/User');
const AuthSession = require('../models/AuthSession');
const { getJwtSecret } = require('../utils/authConfig');

const auth = async (req, res, next) => {
  const token = req.headers.authorization?.startsWith('Bearer ')
    ? req.headers.authorization.slice(7)
    : null;

  if (!token) return res.status(401).json({ msg: 'Acesso não autorizado' });

  let claims;
  try {
    claims = jwt.verify(token, getJwtSecret(), { algorithms: ['HS256'] });
  } catch (error) {
    if (error.status === 503) return res.status(503).json({ msg: error.message });
    return res.status(401).json({ msg: 'Sessão inválida ou expirada' });
  }

  const caminho = (req.originalUrl || '').split('?')[0];
  if (claims.sid) {
    if (!mongoose.isObjectIdOrHexString(claims.sid)) return res.status(401).json({ msg: 'Sessão inválida ou expirada' });
    try {
      const session = await AuthSession.findOne({ _id: claims.sid, revokedAt: null, expiresAt: { $gt: new Date() } }).lean();
      if (!session || String(session.subjectId) !== String(claims.id || claims.entregadorId) || session.tokenVersion !== (claims.tokenVersion ?? 0)) return res.status(401).json({ msg: 'Sessão inválida ou expirada' });
    } catch (error) { return next(error); }
  }
  // Credenciais autônomas do Delivery são validadas por courierAuth/integrationAuth.
  if (claims.role === 'sistema' || (claims.role === 'entregador' && !claims.id)) {
    const permitido = claims.role === 'sistema'
      ? caminho === '/api/pedidos/integracao'
      : /^\/api\/entregador(?:\/|$)/.test(caminho);
    if (!permitido) return res.status(403).json({ msg: 'Esta sessão só permite acesso ao DeliveryLink' });
    req.user = claims;
    return next();
  }

  if (!mongoose.isObjectIdOrHexString(claims.id)) return res.status(401).json({ msg: 'Sessão inválida ou expirada' });
  const tokenVersion = claims.tokenVersion === undefined ? 0 : claims.tokenVersion;
  if (!Number.isSafeInteger(tokenVersion) || tokenVersion < 0) return res.status(401).json({ msg: 'Sessão inválida ou expirada' });

  try {
    const user = await User.findById(claims.id).select('username role tenantId ativo tokenVersion').lean();
    if (!user || user.ativo === false || tokenVersion !== (user.tokenVersion ?? 0)) {
      return res.status(401).json({ msg: 'Sessão inválida ou expirada' });
    }
    req.user = {
      ...claims,
      id: String(user._id),
      username: user.username,
      role: user.role,
      tokenVersion: user.tokenVersion ?? 0,
    };
    // A associação ao comércio também deve acompanhar o estado atual do usuário.
    delete req.user.tenantId;
    if (user.tenantId) req.user.tenantId = String(user.tenantId);
    if (['tenant_admin', 'admin_plataforma', 'entregador'].includes(req.user.role) && !/^\/api\/(tenant(?:\/|$)|plataforma(?:\/|$)|entregador(?:\/|$)|delivery\/logout$|pedidos\/integracao$|auth\/(?:me|logout)$)/.test(caminho)) {
      return res.status(403).json({ msg: 'Esta sessão só permite acesso ao DeliveryLink' });
    }
    return next();
  } catch (error) { return next(error); }
};

auth.allowRoles = (...roles) => (req, res, next) => {
  if (!roles.includes(req.user?.role)) return res.status(403).json({ msg: 'Você não tem permissão para esta ação' });
  next();
};

module.exports = auth;

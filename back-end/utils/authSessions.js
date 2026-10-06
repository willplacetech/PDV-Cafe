const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const AuthSession = require('../models/AuthSession');
const User = require('../models/User');
const Entregador = require('../models/Entregador');
const Tenant = require('../models/Tenant');
const PedidoEntrega = require('../models/PedidoEntrega');
const { getJwtSecret } = require('./authConfig');
const { trustedOrigin, cookieProtection } = require('./sessionOrigins');
const duration = 7 * 24 * 60 * 60 * 1000;
const scopes = { pdv: { cookie: 'pdv_refresh', path: '/api/auth' }, delivery: { cookie: 'delivery_refresh', path: '/api/delivery' }, courier: { cookie: 'courier_refresh', path: '/api/entregador' } };
const hash = token => crypto.createHash('sha256').update(token).digest('hex');
// Deterministic successor lets concurrent tabs receive the same rotated value;
// neither the old nor the new plaintext credential is persisted.
const successor = token => crypto.createHmac('sha384', getJwtSecret()).update(`refresh-rotation:${token}`).digest('base64url');
const cookieOptions = scope => ({ httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'strict', path: scopes[scope].path });
const readCookie = (req, scope) => {
  const value = (req.headers.cookie || '').split(';').map(part => part.trim()).find(part => part.startsWith(`${scopes[scope].cookie}=`));
  return value?.slice(scopes[scope].cookie.length + 1);
};
const publicUser = subject => ({ id: subject.id || String(subject._id), username: subject.username, role: subject.role, ...(subject.tenantId ? { tenantId: String(subject.tenantId) } : {}) });
const access = (user, session) => jwt.sign({ ...user, sid: String(session._id), tokenVersion: session.tokenVersion }, getJwtSecret(), { algorithm: 'HS256', expiresIn: '15m' });
const emit = (res, scope, session, secret) => res.cookie(scopes[scope].cookie, `${session._id}.${secret}`, { ...cookieOptions(scope), maxAge: Math.max(0, session.expiresAt.getTime() - Date.now()) });
const issue = async (req, res, subject, scope, user = publicUser(subject)) => {
  const secret = crypto.randomBytes(48).toString('base64url');
  const session = await AuthSession.create({ subjectId: subject._id, kind: scope === 'courier' ? 'courier' : 'user', scope, tokenVersion: subject.tokenVersion ?? 0, tokenHash: hash(secret), expiresAt: new Date(Date.now() + duration) });
  if (trustedOrigin(req)) emit(res, scope, session, secret);
  return { user, token: access(user, session) };
};
const loadSubject = async session => {
  if (session.kind === 'courier') {
    const courier = await Entregador.findOne({ _id: session.subjectId, ativo: true });
    if (!courier) return null;
    const tenantIds = courier.tenantId ? [String(courier.tenantId)] : await PedidoEntrega.distinct('tenantId', { entregadorId: courier._id });
    return { role: 'entregador', entregadorId: courier.id, tenantIds };
  }
  const user = await User.findById(session.subjectId);
  if (!user || user.ativo === false || (user.tokenVersion ?? 0) !== session.tokenVersion) return null;
  if (session.scope === 'pdv' && !['admin', 'operador', 'cozinha', 'garcom'].includes(user.role)) return null;
  if (session.scope === 'delivery' && !['tenant_admin', 'admin_plataforma'].includes(user.role)) return null;
  if (user.role === 'tenant_admin' && !await Tenant.exists({ _id: user.tenantId, ativo: true })) return null;
  return publicUser(user);
};
const refresh = scope => [cookieProtection, async (req, res, next) => {
  try {
    const [id, secret, extra] = (readCookie(req, scope) || '').split('.');
    if (extra || !mongoose.isObjectIdOrHexString(id) || !/^[A-Za-z0-9_-]{64}$/.test(secret || '')) return res.status(401).json({ msg: 'Sessão inválida ou expirada' });
    const now = new Date();
    const session = await AuthSession.findOne({ _id: id, scope, revokedAt: null, expiresAt: { $gt: now } });
    if (!session) return res.status(401).json({ msg: 'Sessão inválida ou expirada' });
    const user = await loadSubject(session);
    if (!user) { await AuthSession.updateOne({ _id: id }, { $set: { revokedAt: now } }); return res.status(401).json({ msg: 'Sessão revogada' }); }
    const incomingHash = hash(secret);
    const nextSecret = successor(secret);
    const rotated = await AuthSession.findOneAndUpdate({ _id: id, scope, revokedAt: null, tokenHash: incomingHash, expiresAt: { $gt: now } }, { $set: { tokenHash: hash(nextSecret), previousHash: incomingHash, graceUntil: new Date(now.getTime() + 30000) } }, { new: true });
    if (rotated) { emit(res, scope, rotated, nextSecret); return res.json({ user, token: access(user, rotated) }); }
    const concurrent = await AuthSession.findOne({ _id: id, scope, revokedAt: null, previousHash: incomingHash, tokenHash: hash(nextSecret), graceUntil: { $gt: now }, expiresAt: { $gt: now } });
    if (concurrent) { emit(res, scope, concurrent, nextSecret); return res.json({ user, token: access(user, concurrent) }); }
    await AuthSession.updateOne({ _id: id, scope, previousHash: incomingHash }, { $set: { revokedAt: now } });
    return res.status(401).json({ msg: 'Sessão revogada' });
  } catch (error) { return next(error); }
}];
const clearCookie = (res, scope) => res.clearCookie(scopes[scope].cookie, cookieOptions(scope));
const revokeAccessSession = async claims => {
  if (!claims.sid) return false;
  await AuthSession.updateOne({ _id: claims.sid }, { $set: { revokedAt: new Date() } });
  return true;
};
const logoutAuth = (scope, bearerAuth) => async (req, res, next) => {
  if (req.headers.authorization) return bearerAuth(req, res, next);
  const [id, secret, extra] = (readCookie(req, scope) || '').split('.');
  if (!secret) return res.status(401).json({ msg: 'Sessão inválida ou expirada' });
  return cookieProtection(req, res, async () => {
    try {
      if (extra || !mongoose.isObjectIdOrHexString(id) || !/^[A-Za-z0-9_-]{64}$/.test(secret)) return res.status(401).json({ msg: 'Sessão inválida ou expirada' });
      const session = await AuthSession.findOne({ _id: id, scope, revokedAt: null, expiresAt: { $gt: new Date() }, $or: [{ tokenHash: hash(secret) }, { previousHash: hash(secret), graceUntil: { $gt: new Date() } }] });
      if (!session) return res.status(401).json({ msg: 'Sessão inválida ou expirada' });
      const user = await loadSubject(session);
      if (!user) return res.status(401).json({ msg: 'Sessão revogada' });
      req.user = { ...user, sid: session.id, tokenVersion: session.tokenVersion };
      return next();
    } catch (error) { return next(error); }
  });
};
module.exports = { issue, refresh, publicUser, clearCookie, revokeAccessSession, cookieOptions, scopes, logoutAuth };

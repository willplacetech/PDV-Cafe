const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const auth = require('../middleware/auth');
const router = express.Router();
const { PASSWORD_MESSAGE, validLoginPassword, validNewPassword, validUsername } = require('../utils/passwordPolicy');
const sessions = require('../utils/authSessions');
const pdvRoles = ['admin', 'operador', 'cozinha', 'garcom'];
const publicManagedUser = user => ({ id: user.id, username: user.username, role: user.role, ativo: user.ativo !== false });

const cookieOptions = {
  httpOnly: true,
  sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'strict',
  secure: process.env.NODE_ENV === 'production',
  maxAge: 24 * 60 * 60 * 1000,
  path: '/',
};

const { trustedOrigin } = require('../utils/sessionOrigins');

// @route   POST api/auth/login
// @desc    Login e retornar token
// @access  Público
router.post('/login', async (req, res, next) => {
  const origin = req?.headers?.origin;
  if (typeof origin === 'string' && !trustedOrigin(req)) {
    return res.status(403).json({ msg: 'Origem da sessão não autorizada' });
  }
  const { username, password } = req.body || {};
  if (typeof username !== 'string' || !validUsername(username.trim()) || typeof password !== 'string' || !validLoginPassword(password)) {
    return res.status(400).json({ msg: 'Informe usuário e senha válidos' });
  }
  try {
    const user = await User.findOne({ username: username.toLowerCase().trim() }).select('+password');
    if (!user || user.ativo === false || !(await user.matchPassword(password))) {
      return res.status(401).json({ msg: 'Usuário ou senha inválidos' });
    }
    const publicUser = { id: user.id, username: user.username, role: user.role, ...(user.tenantId ? { tenantId: user.tenantId } : {}) };
    return res.json(await sessions.issue(req, res, user, 'pdv', publicUser));
  } catch (error) { return next(error); }
});

// @route   GET api/auth/me
// @desc    Informar o operador autenticado
// @access  Privado
router.get('/me', auth, (req, res) => {
  res.json({ id: req.user.id, username: req.user.username, role: req.user.role, ...(req.user.tenantId ? { tenantId: req.user.tenantId } : {}) });
});

router.post('/refresh', ...sessions.refresh('pdv'));

router.post('/register', auth, auth.allowRoles('admin'), async (req, res) => {
  try {
    const body = req.body || {};
    const username = typeof body.username === 'string' ? body.username.toLowerCase().trim() : '';
    const password = body.password;
    const role = ['admin', 'operador', 'cozinha', 'garcom'].includes(body.role) ? body.role : 'operador';
    if (!validUsername(username)) return res.status(400).json({ msg: 'Usuário deve ter entre 2 e 254 caracteres válidos' });
    if (!validNewPassword(password)) return res.status(400).json({ msg: PASSWORD_MESSAGE });
    if (await User.exists({ username })) return res.status(409).json({ msg: 'Este usuário já existe' });
    const user = await User.create({ username, password, role });
    res.status(201).json({ id: user.id, username: user.username, role: user.role });
  } catch (err) { res.status(400).json({ msg: err.message }); }
});

// Administração de contas PDV; cada alteração revoga as sessões anteriores.
router.get('/users', auth, auth.allowRoles('admin'), async (req, res, next) => {
  try {
    const users = await User.find({ role: { $in: pdvRoles } }).select('username role ativo').sort({ username: 1 });
    res.json(users.map(publicManagedUser));
  } catch (error) { next(error); }
});

router.patch('/users/:id', auth, auth.allowRoles('admin'), async (req, res, next) => {
  const body = req.body || {};
  const campos = Object.keys(body);
  if (!mongoose.isObjectIdOrHexString(req.params.id) || !campos.length || campos.some(campo => !['ativo', 'role', 'password'].includes(campo))) {
    return res.status(400).json({ msg: 'Informe usuário e campos válidos' });
  }
  if (('ativo' in body && typeof body.ativo !== 'boolean') || ('role' in body && !pdvRoles.includes(body.role)) || ('password' in body && !validNewPassword(body.password))) {
    return res.status(400).json({ msg: `Informe estado e perfil válidos. ${PASSWORD_MESSAGE}` });
  }
  try {
    const alteracoes = {};
    if ('ativo' in body) alteracoes.ativo = body.ativo;
    if ('role' in body) alteracoes.role = body.role;
    // findOneAndUpdate não executa o hook de senha de save; hash antes do update atômico.
    if ('password' in body) alteracoes.password = await bcrypt.hash(body.password, 10);
    const user = await User.findOneAndUpdate(
      { _id: req.params.id, role: { $in: pdvRoles } },
      { $set: alteracoes, $inc: { tokenVersion: 1 } },
      { new: true, runValidators: true },
    );
    if (!user) return res.status(404).json({ msg: 'Usuário não encontrado' });
    res.json(publicManagedUser(user));
  } catch (error) { next(error); }
});

router.post('/logout', sessions.logoutAuth('pdv', auth), async (req, res, next) => {
  try {
    if (!await sessions.revokeAccessSession(req.user)) {
      const user = await User.findByIdAndUpdate(req.user.id, { $inc: { tokenVersion: 1 } });
      if (!user) return res.status(401).json({ msg: 'Sessão inválida ou expirada' });
    }
    const clearCookieOptions = { ...cookieOptions };
    delete clearCookieOptions.maxAge;
    res.clearCookie('pdv_token', clearCookieOptions);
    sessions.clearCookie(res, 'pdv');
    res.status(204).end();
  } catch (error) { next(error); }
});

module.exports = router;

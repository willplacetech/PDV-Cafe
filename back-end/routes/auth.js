const express = require('express');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const auth = require('../middleware/auth');
const router = express.Router();
const { getJwtSecret } = require('../utils/authConfig');

const cookieOptions = {
  httpOnly: true,
  sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'strict',
  secure: process.env.NODE_ENV === 'production',
  maxAge: 24 * 60 * 60 * 1000,
  path: '/',
};

// @route   POST api/auth/login
// @desc    Login e retornar token
// @access  Público
router.post('/login', async (req, res, next) => {
  const { username, password } = req.body || {};
  if (typeof username !== 'string' || !username.trim() || typeof password !== 'string' || !password || password.length > 1024) {
    return res.status(400).json({ msg: 'Informe usuário e senha válidos' });
  }
  try {
    const user = await User.findOne({ username: username.toLowerCase().trim() }).select('+password');
    if (!user || !(await user.matchPassword(password))) {
      return res.status(401).json({ msg: 'Usuário ou senha inválidos' });
    }
    const publicUser = { id: user.id, username: user.username, role: user.role };
    const token = jwt.sign(publicUser, getJwtSecret(), { expiresIn: '24h', algorithm: 'HS256' });
    return res.json({ user: publicUser, token });
  } catch (error) { return next(error); }
});

// @route   GET api/auth/me
// @desc    Informar o operador autenticado
// @access  Privado
router.get('/me', auth, (req, res) => {
  res.json({ id: req.user.id, username: req.user.username, role: req.user.role });
});

router.post('/register', auth, auth.allowRoles('admin'), async (req, res) => {
  try {
    const username = typeof req.body.username === 'string' ? req.body.username.toLowerCase().trim() : '';
    const password = req.body.password;
    const role = ['admin', 'operador', 'cozinha', 'garcom'].includes(req.body.role) ? req.body.role : 'operador';
    if (username.length < 2 || typeof password !== 'string' || password.length < 4) return res.status(400).json({ msg: 'Informe usuário e senha com pelo menos 4 caracteres' });
    if (await User.exists({ username })) return res.status(409).json({ msg: 'Este usuário já existe' });
    const user = await User.create({ username, password, role });
    res.status(201).json({ id: user.id, username: user.username, role: user.role });
  } catch (err) { res.status(400).json({ msg: err.message }); }
});

router.post('/logout', (req, res) => {
  const clearCookieOptions = { ...cookieOptions };
  delete clearCookieOptions.maxAge;
  res.clearCookie('pdv_token', clearCookieOptions);
  res.status(204).end();
});

module.exports = router;

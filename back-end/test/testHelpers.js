const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const User = require('../models/User');
const { getJwtSecret } = require('../utils/authConfig');

process.env.JWT_SECRET ||= 'test-secret-with-at-least-32-characters-for-testing';

const makeUser = async (data = {}) => {
  const user = new User({ username: 'admin-test', password: 'admin-test-password-123', role: 'admin', ativo: true, ...data });
  await user.save();
  return user;
};

const makeGerente = async (data = {}) => {
  const user = new User({ username: 'gerente-test', password: 'gerente-test-password-123', role: 'gerente', ativo: true, ...data });
  await user.save();
  return user;
};

const makeOperador = async (data = {}) => {
  const user = new User({ username: 'operador-test', password: 'operador-test-password-123', role: 'operador', ativo: true, ...data });
  await user.save();
  return user;
};

const tokenFor = (user, overrides = {}) => jwt.sign(
  { id: String(user._id), username: user.username, role: user.role, tokenVersion: user.tokenVersion ?? 0, ...overrides },
  getJwtSecret(),
  { algorithm: 'HS256', expiresIn: '15m' }
);

const authHeader = (token) => ({ Authorization: `Bearer ${token}` });

const gerenteToken = (user, acao) => tokenFor(user, { acao });

const supertest = require('supertest');

module.exports = { makeUser, makeGerente, makeOperador, tokenFor, authHeader, gerenteToken, supertest };
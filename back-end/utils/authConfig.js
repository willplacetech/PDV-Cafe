const crypto = require('crypto');
const RuntimeSettings = require('../models/RuntimeSettings');

const LEGACY_SECRET = 'desenvolvimento-altere-esta-chave';
let persistedSecret;

const configuredSecret = () => {
  const value = process.env.JWT_SECRET;
  return typeof value === 'string' && value.trim() && value !== LEGACY_SECRET ? value : null;
};

const getJwtSecret = () => {
  const secret = configuredSecret() || persistedSecret;
  if (!secret) {
    const error = new Error('Autenticação ainda não inicializada');
    error.status = 503;
    throw error;
  }
  return secret;
};

// A chave gerada fica no banco, compartilhada entre processos e reinicializações.
// Configurações JWT_SECRET já existentes continuam sendo utilizadas.
const initializeAuth = async () => {
  if (configuredSecret()) return;
  const settings = await RuntimeSettings.findOneAndUpdate(
    { _id: 'authentication' },
    { $setOnInsert: { jwtSecret: crypto.randomBytes(48).toString('hex') } },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  ).select('+jwtSecret');
  persistedSecret = settings.jwtSecret;
  if (!persistedSecret || persistedSecret === LEGACY_SECRET) throw new Error('Chave de autenticação inválida');
};

module.exports = { getJwtSecret, initializeAuth };

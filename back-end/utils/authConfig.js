const crypto = require('crypto');
const RuntimeSettings = require('../models/RuntimeSettings');

const LEGACY_SECRET = 'desenvolvimento-altere-esta-chave';
let persistedSecret;

const validSecret = value => typeof value === 'string' && Buffer.byteLength(value, 'utf8') >= 32
  && value.trim() === value && value !== LEGACY_SECRET && new Set(value).size >= 8;
const invalidSecret = () => {
  const error = new Error('JWT_SECRET inválido: use uma chave aleatória com pelo menos 32 bytes UTF-8');
  error.status = 503;
  return error;
};
const configuredSecret = () => {
  const value = process.env.JWT_SECRET;
  // Vazio equivale a não configurado. Valores fracos falham sem fallback.
  if (value === undefined || value === '') return null;
  if (!validSecret(value)) throw invalidSecret();
  return value;
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
const initializeAuth = async () => {
  if (configuredSecret()) return;
  persistedSecret = undefined;
  const settings = await RuntimeSettings.findOneAndUpdate(
    { _id: 'authentication' },
    { $setOnInsert: { jwtSecret: crypto.randomBytes(48).toString('hex') } },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  ).select('+jwtSecret');
  if (!validSecret(settings?.jwtSecret)) throw invalidSecret();
  persistedSecret = settings.jwtSecret;
};

module.exports = { getJwtSecret, initializeAuth };

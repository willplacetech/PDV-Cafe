const PASSWORD_MESSAGE = 'Senha deve ter pelo menos 12 caracteres e no máximo 72 bytes UTF-8';

const validLoginPassword = value => typeof value === 'string' && value.length > 0 && Buffer.byteLength(value, 'utf8') <= 72;
const validNewPassword = value => validLoginPassword(value) && Array.from(value).length >= 12;
const validatePassword = (value, nova = true) => {
  if (!(nova ? validNewPassword(value) : validLoginPassword(value))) {
    const error = new Error(nova ? PASSWORD_MESSAGE : 'Informe senha válida com no máximo 72 bytes UTF-8');
    error.status = 400;
    throw error;
  }
  return value;
};
const validUsername = value => typeof value === 'string' && value.length >= 2 && value.length <= 254
  && Array.from(value).every(character => character.charCodeAt(0) >= 32 && character.charCodeAt(0) !== 127);
const validEmail = value => typeof value === 'string' && value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

module.exports = { PASSWORD_MESSAGE, validLoginPassword, validNewPassword, validatePassword, validUsername, validEmail };

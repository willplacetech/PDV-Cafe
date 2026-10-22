const crypto = require('crypto');

const gerarTokenMesa = () => crypto.randomBytes(32).toString('base64url');

const garantirTokensMesas = async (settings) => {
  if (!settings || !Array.isArray(settings.mesas)) {
    throw new TypeError('Configuração de mesas inválida');
  }

  const tokens = new Set();
  let alterado = false;

  for (const mesa of settings.mesas) {
    if (typeof mesa.token === 'string' && mesa.token && !tokens.has(mesa.token)) {
      tokens.add(mesa.token);
      continue;
    }

    let token;
    do {
      token = gerarTokenMesa();
    } while (tokens.has(token));

    mesa.token = token;
    tokens.add(token);
    alterado = true;
  }

  if (alterado || settings.isModified()) await settings.save();
  return settings;
};

module.exports = { gerarTokenMesa, garantirTokensMesas };

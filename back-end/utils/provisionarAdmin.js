const User = require('../models/User');
const { PASSWORD_MESSAGE, validNewPassword, validUsername } = require('./passwordPolicy');

const provisionarAdmin = async () => {
  const username = (process.env.ADMIN_USERNAME || 'admin').toLowerCase().trim();
  if (await User.exists({ username })) return;
  // Uma instalação em uso não ganha outra conta automaticamente.
  if (await User.exists({ role: 'admin' })) return;
  const password = process.env.ADMIN_PASSWORD;
  if (!validUsername(username) || !validNewPassword(password)) {
    throw new Error(`Defina ADMIN_USERNAME válido e ADMIN_PASSWORD para criar o primeiro administrador. ${PASSWORD_MESSAGE}`);
  }
  await User.create({ username, password, role: 'admin' });
};

module.exports = provisionarAdmin;

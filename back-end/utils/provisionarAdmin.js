const User = require('../models/User');

const provisionarAdmin = async () => {
  const username = (process.env.ADMIN_USERNAME || 'admin').toLowerCase().trim();
  if (await User.exists({ username })) return;
  // Uma instalação em uso não ganha outra conta automaticamente.
  if (await User.exists({ role: 'admin' })) return;
  const password = process.env.ADMIN_PASSWORD;
  if (typeof password !== 'string' || password.length < 12 || password === '1234') {
    throw new Error('Defina ADMIN_PASSWORD com pelo menos 12 caracteres para criar o primeiro administrador');
  }
  await User.create({ username, password, role: 'admin' });
};

module.exports = provisionarAdmin;

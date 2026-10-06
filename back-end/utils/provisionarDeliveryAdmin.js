const User = require('../models/User');
const { PASSWORD_MESSAGE, validNewPassword, validEmail } = require('./passwordPolicy');

module.exports = async () => {
  if (await User.exists({ role: 'admin_plataforma' })) return;
  const email = process.env.DELIVERY_ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.DELIVERY_ADMIN_PASSWORD;
  if (!email && !password) return;
  if (!validEmail(email) || !validNewPassword(password)) throw new Error(`Defina DELIVERY_ADMIN_EMAIL válido e DELIVERY_ADMIN_PASSWORD para criar o administrador DeliveryLink. ${PASSWORD_MESSAGE}`);
  if (await User.exists({ username: email })) throw new Error('O e-mail da plataforma já está em uso');
  await User.create({ username: email, email, password, role: 'admin_plataforma' });
};

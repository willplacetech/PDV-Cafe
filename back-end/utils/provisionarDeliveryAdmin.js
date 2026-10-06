const User = require('../models/User');

module.exports = async () => {
  if (await User.exists({ role: 'admin_plataforma' })) return;
  const email = process.env.DELIVERY_ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.DELIVERY_ADMIN_PASSWORD;
  if (!email && !password) return;
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || typeof password !== 'string' || password.length < 12 || Buffer.byteLength(password, 'utf8') > 72) throw new Error('Defina DELIVERY_ADMIN_EMAIL e DELIVERY_ADMIN_PASSWORD (12 a 72 bytes) para criar o administrador DeliveryLink');
  if (await User.exists({ username: email })) throw new Error('O e-mail da plataforma já está em uso');
  await User.create({ username: email, email, password, role: 'admin_plataforma' });
};

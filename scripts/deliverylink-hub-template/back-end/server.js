const path = require('node:path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const cors = require('cors');
const express = require('express');
const mongoose = require('mongoose');
const { rateLimit } = require('express-rate-limit');
const routes = require('./src/routes');
const User = require('./src/models/User');

const required = ['MONGODB_URI', 'JWT_SECRET', 'HUB_ADMIN_EMAIL', 'HUB_ADMIN_PASSWORD'];
for (const name of required) {
  if (!process.env[name]) throw new Error(`Missing required environment variable: ${name}`);
}
if (Buffer.byteLength(process.env.JWT_SECRET, 'utf8') < 32) throw new Error('JWT_SECRET must contain at least 32 bytes.');

const app = express();
app.disable('x-powered-by');
app.use(cors({ origin: (process.env.CORS_ORIGIN || '').split(',').map(value => value.trim()).filter(Boolean) }));
app.use(express.json({ limit: '256kb' }));
app.use('/api/auth', rateLimit({ windowMs: 15 * 60 * 1000, limit: 20, standardHeaders: true, legacyHeaders: false }));
app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));
app.use('/api', routes);
app.use((error, _req, res, _next) => {
  if (error.status) return res.status(error.status).json({ message: error.message });
  if (error.code === 11000) return res.status(409).json({ message: 'A record with these unique values already exists.' });
  if (error.name === 'ValidationError' || error.name === 'CastError') return res.status(400).json({ message: 'Invalid data.' });
  console.error(error);
  return res.status(500).json({ message: 'The request could not be completed.' });
});

async function start() {
  await mongoose.connect(process.env.MONGODB_URI);
  if (!await User.exists({})) {
    await User.create({
      email: process.env.HUB_ADMIN_EMAIL.toLowerCase(),
      passwordHash: process.env.HUB_ADMIN_PASSWORD,
      role: 'platform_admin',
    });
  }
  const port = Number(process.env.PORT || 5000);
  app.listen(port, () => console.log(`DeliveryLinkHub API listening on ${port}`));
}

if (require.main === module) {
  start().catch(error => {
    console.error(`DeliveryLinkHub startup failed: ${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = { app, start };

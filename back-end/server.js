require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const colors = require('colors');
const path = require('path'); // ← ADICIONADO
const connectDB = require('./db');
const User = require('./models/User');

const app = express();

const allowedOrigins = [
  ...(process.env.FRONTEND_URL || '').split(','),
  'https://sabordabraco.onrender.com',
  'https://saborabraco.onrender.com',
  'https://pdv-cafe-web-willplacetech.onrender.com',
  'https://pdv-mern-1.onrender.com',
]
  .map((origin) => origin.trim().replace(/\/$/, ''))
  .filter(Boolean);

const isRenderOrigin = (origin) => /^https:\/\/[a-z0-9-]+\.onrender\.com$/i.test(origin);

const corsOptions = {
  origin: (requestOrigin, callback) => {
    const normalizedOrigin = requestOrigin?.replace(/\/$/, '');
    if (!normalizedOrigin || allowedOrigins.includes(normalizedOrigin) || isRenderOrigin(normalizedOrigin)) {
      return callback(null, true);
    }
    return callback(new Error('Origem não autorizada pelo CORS'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
};

// Middlewares
app.disable('x-powered-by');
app.use(helmet());
app.use(cors(corsOptions));
app.options('*', cors(corsOptions));
app.use(express.json({ limit: '1mb' }));

app.use((req, res, next) => {
  const cookieHeader = req.headers.cookie || '';
  req.cookies = Object.fromEntries(cookieHeader.split(';').filter(Boolean).map((cookie) => {
    const separator = cookie.indexOf('=');
    return [cookie.slice(0, separator).trim(), decodeURIComponent(cookie.slice(separator + 1).trim())];
  }));
  next();
});

app.use('/api/auth/login', rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { msg: 'Muitas tentativas de login. Tente novamente mais tarde.' },
}));

// Rotas da API
app.use('/api/auth', require('./routes/auth'));
app.use('/api/products', require('./routes/products'));
app.use('/api/production', require('./routes/production'));
app.use('/api/customers', require('./routes/customers'));
app.use('/api/orders', require('./routes/orders'));
app.use('/api/comandas', require('./routes/comandas'));
app.use('/api/fiscal', require('./routes/fiscal'));
app.use('/api/dashboard', require('./routes/dashboard'));
app.use('/api/despesas', require('./routes/despesas'));
app.use('/api/contabil', require('./routes/contabil'));
app.use('/api/insumos', require('./routes/insumos'));
app.use('/api/receitas', require('./routes/receitas'));
app.use('/api/produtos', require('./routes/products'));

// Rota base da API
app.get('/api', (req, res) => {
  res.json({ 
    msg: 'API PDV MERN funcionando!',
    version: '1.0.0',
    endpoints: {
      auth: '/api/auth',
      products: '/api/products',
      production: '/api/production',
      customers: '/api/customers',
      orders: '/api/orders',
      comandas: '/api/comandas',
      fiscal: '/api/fiscal'
    }
  });
});

// ============================================================
// ↓↓↓ CORREÇÃO DOS 404 — Frontend SPA (Vite/React) ↓↓↓
// ============================================================
// 1) Serve os arquivos estáticos do build (pasta dist do Vite)
//    Se seu build estiver em outra pasta (ex: build, client/dist),
//    ajuste o caminho abaixo.
app.use(express.static(path.join(__dirname, 'dist')));

// 2) Catch-all: qualquer rota GET que não seja /api/* nem arquivo
//    estático devolve o index.html, e o React Router cuida da navegação.
//    Fica DEPOIS das rotas de API para não interceptá-las.
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});
// ============================================================

// Tratamento de erro global
app.use((err, req, res, next) => {
  console.error(err.stack.red);
  res.status(500).json({ msg: 'Erro interno do servidor' });
});

const PORT = process.env.PORT || 5000;

const startServer = async () => {
  await connectDB();
  const adminUsername = (process.env.ADMIN_USERNAME || 'admin').toLowerCase();
  if (!await User.exists({ username: adminUsername })) {
    await User.create({ username: adminUsername, password: process.env.ADMIN_PASSWORD || '1234', role: 'admin' });
    console.log(`Administrador inicial "${adminUsername}" criado.`.green);
  }
  app.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`.yellow.bold);
  });
};

startServer();
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const colors = require('colors');
const path = require('path'); // ← ADICIONADO
const connectDB = require('./db');
const { initializeAuth } = require('./utils/authConfig');
const provisionarAdmin = require('./utils/provisionarAdmin');

const app = express();

const allowedOrigins = [
  ...(process.env.FRONTEND_URL || '').split(','),
  'https://sabordabraco.onrender.com',
  'https://saborabraco.onrender.com',
  'https://pdv-cafe-web-willplacetech.onrender.com',
  'https://pdv-mern-1.onrender.com',
  'https://sabordabraco-95pc.onrender.com',
]
  .map((origin) => origin.trim().replace(/\/$/, ''))
  .filter(Boolean);


const corsOptions = {
  origin: (requestOrigin, callback) => {
    const normalizedOrigin = requestOrigin?.replace(/\/$/, '');
    if (!normalizedOrigin || allowedOrigins.includes(normalizedOrigin)) {
      return callback(null, true);
    }
    const error = new Error('Origem não autorizada pelo CORS');
    error.status = 403;
    return callback(error);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Idempotency-Key'],
};

// Middlewares
app.disable('x-powered-by');
app.use(helmet());
app.use(cors(corsOptions));
app.options('/api/*', cors(corsOptions));
app.use(express.json({ limit: '1mb' }));

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
app.use('/api/caixa', require('./routes/caixa'));
app.use('/api/fiscal', require('./routes/fiscal'));
app.use('/api/dashboard', require('./routes/dashboard'));
app.use('/api/despesas', require('./routes/despesas'));
app.use('/api/contabil', require('./routes/contabil'));
app.use('/api/insumos', require('./routes/insumos'));
app.use('/api/compras', require('./routes/purchases'));
app.use('/api/receitas', require('./routes/receitas'));
app.use('/api/produtos', require('./routes/products'));
app.use('/api/mesas', require('./routes/mesas'));

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
  if (res.headersSent) return next(err);
  const status = Number(err.status || err.statusCode) || 500;
  if (status >= 500) console.error(err.stack || err.message);
  res.status(status).json({ msg: status >= 500 && status !== 503 ? 'Erro interno do servidor' : err.message });
});

const PORT = process.env.PORT || 5000;

const startServer = async () => {
  await connectDB();
  await require('./models/Comanda').init();
  await initializeAuth();
  await provisionarAdmin();
  app.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`.yellow.bold);
  });
};

if (require.main === module) {
  startServer().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

module.exports = app;
module.exports.startServer = startServer;
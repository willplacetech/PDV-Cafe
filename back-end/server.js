require('dotenv').config();
require('./instrument');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const colors = require('colors');
const path = require('path');
const connectDB = require('./db');
const { initializeAuth } = require('./utils/authConfig');
const provisionarAdmin = require('./utils/provisionarAdmin');
const errorHandler = require('./middleware/errorHandler');

const app = express();
const trustProxyHops = process.env.TRUST_PROXY_HOPS === undefined ? 0 : Number(process.env.TRUST_PROXY_HOPS);
if (!Number.isSafeInteger(trustProxyHops) || trustProxyHops < 0) {
  throw new Error('TRUST_PROXY_HOPS deve ser um inteiro não negativo.');
}
app.set('trust proxy', trustProxyHops);
const { allowedOrigins } = require('./utils/sessionOrigins');
const corsOptions = { origin: (requestOrigin, callback) => { const normalizedOrigin = requestOrigin?.replace(/\/$/, ''); if (!normalizedOrigin || allowedOrigins().includes(normalizedOrigin)) return callback(null, true); const error = new Error('Origem não autorizada pelo CORS'); error.status = 403; return callback(error); }, credentials: true, methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'], allowedHeaders: ['Content-Type', 'Authorization', 'Idempotency-Key', 'X-CSRF-Protection', 'X-Autorizacao-Gerente'] };
app.disable('x-powered-by');
app.use(helmet({ contentSecurityPolicy: { directives: { frameSrc: ["'self'", 'https://www.openstreetmap.org'] } } }));
app.use(cors(corsOptions)); app.options('/api/*', cors(corsOptions)); app.use(express.json({ limit: '1mb' }));
const limiteLogApiLentaMs = Math.max(100, Number(process.env.SLOW_API_LOG_MS) || 1000);
app.use((req, res, next) => { if (!req.path.startsWith('/api/')) return next(); const iniciadoEm = Date.now(); let registrado = false; const registrarConclusao = (aborted = false) => { if (registrado) return; registrado = true; const duracaoMs = Date.now() - iniciadoEm; const erroServidor = res.statusCode >= 500; if (erroServidor && !req.sentryCaptured) require('./instrument').captureException(new Error('HTTP 5xx'), req.user?.id); if (!aborted && !erroServidor && duracaoMs < limiteLogApiLentaMs) return; const registro = JSON.stringify({ evento: aborted ? 'api_aborted' : erroServidor ? 'api_error' : 'api_slow', metodo: req.method, caminho: req.path, status: res.statusCode, duracaoMs }); if (aborted || erroServidor) console.error(`[API] ${registro}`); else console.warn(`[API] ${registro}`); }; res.once('finish', () => registrarConclusao()); res.once('close', () => { if (!res.writableEnded) registrarConclusao(true); }); next(); });
app.use('/api/auth/login', rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: 'draft-8', legacyHeaders: false, message: { msg: 'Muitas tentativas de login. Tente novamente mais tarde.' } }));
app.use('/api/auth', require('./routes/auth'));
const auth = require('./middleware/auth');
const tenantRoutes = [
  ['/api/products', require('./routes/products')],
  ['/api/production', require('./routes/production')],
  ['/api/customers', require('./routes/customers')],
  ['/api/orders', require('./routes/orders')],
  ['/api/comandas', require('./routes/comandas')],
  ['/api/contas-receber', require('./routes/contasReceber')],
  ['/api/estoque', require('./routes/estoque')],
  ['/api/caixa', require('./routes/caixa')],
  ['/api/fiscal', require('./routes/fiscal')],
  ['/api/dashboard', require('./routes/dashboard')],
  ['/api/despesas', require('./routes/despesas')],
  ['/api/contabil', require('./routes/contabil')],
  ['/api/payment-settings', require('./routes/paymentSettings')],
  ['/api/insumos', require('./routes/insumos')],
  ['/api/compras', require('./routes/purchases')],
  ['/api/receitas', require('./routes/receitas')],
  ['/api/produtos', require('./routes/products')],
  ['/api/mesas', require('./routes/mesas')],
  ['/api/configuracoes', require('./routes/configuracoes')],
  ['/api/auditoria', require('./routes/auditoria')],
];
for (const [path, router] of tenantRoutes) app.use(path, auth.exigirTenant, router);
app.use('/api/reservas', require('./routes/reservas'));
app.use('/api/pedidos', require('./routes/autoAtendimento'));
app.use('/api/publico/delivery', require('./routes/deliveryPublico'));
app.use('/api', require('./routes/delivery'));
app.get('/api', (req, res) => res.json({ msg: 'API PDV MERN funcionando!', version: '1.0.0', endpoints: { auth: '/api/auth', products: '/api/products', production: '/api/production', customers: '/api/customers', orders: '/api/orders', comandas: '/api/comandas', fiscal: '/api/fiscal', reservas: '/api/reservas', deliveryPublico: '/api/publico/delivery' } }));
app.use('/api', (req, res) => res.status(404).json({ msg: 'Rota da API não encontrada' })); app.get('/health', (req, res) => res.json({ ok: true, status: 'healthy' })); app.use(express.static(path.join(__dirname, 'dist'))); app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'dist', 'index.html'))); app.use(errorHandler);
const PORT = process.env.PORT || 5000; const startServer = async () => { await connectDB(); await require('./models/Comanda').init(); await Promise.all(['Tenant', 'PedidoEntrega', 'Entregador', 'User', 'Reserva'].map(name => require(`./models/${name}`).init())); await initializeAuth(); await provisionarAdmin(); await require('./utils/provisionarDeliveryAdmin')(); require('./utils/deliveryOutbox').iniciar(); app.listen(PORT, () => console.log(`Servidor rodando na porta ${PORT}`.yellow.bold)); }; if (require.main === module) startServer().catch((error) => { console.error(error.message); process.exitCode = 1; }); module.exports = app; module.exports.startServer = startServer;

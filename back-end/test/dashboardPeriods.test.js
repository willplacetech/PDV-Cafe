const test = require('node:test');
const assert = require('node:assert/strict');
const Order = require('../models/Order');
const Comanda = require('../models/Comanda');
const Customer = require('../models/Customer');
const Product = require('../models/Product');
const PaymentSettings = require('../models/PaymentSettings');
const router = require('../routes/dashboard');

const query = (value) => ({
  select() { return this; }, sort() { return this; }, limit() { return this; },
  lean: async () => value,
  then(resolve, reject) { return Promise.resolve(value).then(resolve, reject); },
});

test('dashboard usa os limites de Sao Paulo na virada UTC do mes', async (t) => {
  const originalTimezone = process.env.TZ;
  process.env.TZ = 'UTC';
  t.after(() => {
    if (originalTimezone === undefined) delete process.env.TZ;
    else process.env.TZ = originalTimezone;
  });
  t.mock.timers.enable({ apis: ['Date'], now: new Date('2026-11-01T01:30:00Z') });
  const filters = [];
  t.mock.method(Order, 'find', (filter) => { filters.push(filter); return query([]); });
  t.mock.method(Comanda, 'find', () => query([]));
  t.mock.method(Comanda, 'countDocuments', async () => 0);
  t.mock.method(Customer, 'find', () => query([]));
  t.mock.method(Customer, 'countDocuments', async () => 0);
  t.mock.method(Product, 'find', () => query([]));
  t.mock.method(PaymentSettings, 'findOne', () => query(null));
  const response = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; } };
  await router.stack.find(layer => layer.route?.path === '/').route.stack.at(-1).handle({ query: {} }, response);
  assert.equal(response.statusCode, 200);
  assert.equal(filters[0].createdAt.$gte.toISOString(), '2026-10-31T03:00:00.000Z');
  assert.equal(filters[1].createdAt.$gte.toISOString(), '2026-10-25T03:00:00.000Z');
  assert.equal(filters[2].createdAt.$gte.toISOString(), '2026-10-01T03:00:00.000Z');
  assert.equal(filters[4].createdAt.$lt.toISOString(), '2026-11-01T03:00:00.000Z');
  assert.equal(response.body.relatorioMes.periodo, '01/10/2026 a 31/10/2026');
});

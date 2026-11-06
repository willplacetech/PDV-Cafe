const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../../server');
const User = require('../../models/User');
const Tenant = require('../../models/Tenant');
const Order = require('../../models/Order');

test('falha HTTP do provedor bloqueia nova emissao ate reconciliar o documento', async () => {
  const tenant = await Tenant.create({ nome: 'Fiscal confirmation', slug: 'fiscal-confirmation', telefone: '11999999999', endereco: 'Rua de teste' });
  const user = await User.create({ username: 'fiscal-confirmation', password: 'test-password', role: 'admin', tenantId: tenant._id });
  const token = jwt.sign({ id: user.id, role: user.role }, process.env.JWT_SECRET);
  const order = await Order.create({ numero: 'fiscal-confirmation', atendente: user.username,
    itens: [], subtotal: 10, total: 10, tenantId: tenant._id });
  const keys = ['NFCE_CNPJ', 'NFCE_IE', 'NFCE_RAZAO_SOCIAL', 'NFCE_ENDERECO_LOGRADOURO',
    'NFCE_ENDERECO_NUMERO', 'NFCE_ENDERECO_BAIRRO', 'NFCE_ENDERECO_MUNICIPIO',
    'NFCE_ENDERECO_UF', 'NFCE_ENDERECO_CEP', 'NFCE_CERTIFICATE_PFX_BASE64',
    'NFCE_CERTIFICATE_PASSWORD', 'NFCE_PROVIDER_URL'];
  const previous = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  keys.forEach(key => { process.env[key] = 'test-placeholder'; });
  const provider = jest.spyOn(global, 'fetch').mockResolvedValue({
    ok: false, status: 503, json: async () => ({ message: 'Resultado indisponivel' }),
  });
  const emit = () => request(app).post(`/api/fiscal/orders/${order.id}/emitir`)
    .set('Authorization', `Bearer ${token}`);
  try {
    const first = await emit();
    expect(first.status).toBe(409);
    expect(first.body.code).toBe('INVALID_PROVIDER_RESPONSE');
    expect((await Order.findById(order.id)).nfce.status).toBe('processando');
    expect((await emit()).status).toBe(409);
    expect(provider).toHaveBeenCalledTimes(1);
  } finally {
    provider.mockRestore();
    keys.forEach(key => {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    });
  }
});

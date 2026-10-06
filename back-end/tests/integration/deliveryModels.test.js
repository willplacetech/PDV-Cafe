const Tenant = require('../../models/Tenant');
const PedidoEntrega = require('../../models/PedidoEntrega');

beforeAll(async () => {
  await Promise.all([Tenant.init(), PedidoEntrega.init()]);
});

const criarTenant = (slug = 'cafe-da-praca') => Tenant.create({
  nome: 'Café da Praça', slug, telefone: '11999999999', endereco: 'Rua das Flores, 10',
});

const dadosPedido = (tenantId) => ({
  tenantId,
  fonte: 'formulario',
  origem: {
    nomeCliente: 'Cliente teste', telefone: '11988888888',
    endereco: { rua: 'Rua das Flores', numero: '10', bairro: 'Centro' },
  },
  valorTotal: 25,
});

describe('Modelos DeliveryLink', () => {
  test('slug do comércio é único no banco', async () => {
    await criarTenant();
    await expect(criarTenant()).rejects.toMatchObject({ code: 11000 });
  });

  test('pedido persiste UUID público, timestamps e histórico inicial', async () => {
    const tenant = await criarTenant();
    const criado = await PedidoEntrega.create(dadosPedido(tenant._id));
    const salvo = await PedidoEntrega.findOne({ tokenRastreamento: criado.tokenRastreamento }).lean();
    expect(String(salvo.tenantId)).toBe(String(tenant._id));
    expect(salvo.criadoEm).toBeInstanceOf(Date);
    expect(salvo.atualizadoEm).toBeInstanceOf(Date);
    expect(salvo.statusHistorico[0]).toMatchObject({ status: 'pendente', por: { tipo: 'sistema' } });
    expect(salvo.statusHistorico[0].data).toBeInstanceOf(Date);
  });

  test('token de rastreamento não pode identificar dois pedidos', async () => {
    const tenant = await criarTenant();
    const pedido = await PedidoEntrega.create(dadosPedido(tenant._id));
    await expect(PedidoEntrega.create({ ...dadosPedido(tenant._id), tokenRastreamento: pedido.tokenRastreamento }))
      .rejects.toMatchObject({ code: 11000 });
  });

  test('salvar pedido não altera tenant nem token já persistidos', async () => {
    const tenant = await criarTenant();
    const outro = await criarTenant('outro-comercio');
    const pedido = await PedidoEntrega.create(dadosPedido(tenant._id));
    const tokenOriginal = pedido.tokenRastreamento;
    const novo = new PedidoEntrega(dadosPedido(outro._id));
    pedido.tenantId = outro._id;
    pedido.tokenRastreamento = novo.tokenRastreamento;
    await pedido.save();
    const salvo = await PedidoEntrega.findById(pedido._id).lean();
    expect(String(salvo.tenantId)).toBe(String(tenant._id));
    expect(salvo.tokenRastreamento).toBe(tokenOriginal);
  });
});

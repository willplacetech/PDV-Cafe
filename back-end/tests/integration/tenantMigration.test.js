const mongoose = require('mongoose');
const Tenant = require('../../models/Tenant');
const User = require('../../models/User');
const Product = require('../../models/Product');
const Order = require('../../models/Order');
const Comanda = require('../../models/Comanda');
const Customer = require('../../models/Customer');
const Purchase = require('../../models/Purchase');
const Despesa = require('../../models/Despesa');
const StockMovement = require('../../models/StockMovement');
const Production = require('../../models/Production');
const Recipe = require('../../models/Recipe');
const HistoricoCusto = require('../../models/HistoricoCusto');
const FechamentoCaixa = require('../../models/FechamentoCaixa');
const OperacaoFinanceira = require('../../models/OperacaoFinanceira');
const Auditoria = require('../../models/Auditoria');
const MesasSettings = require('../../models/MesasSettings');
const PaymentSettings = require('../../models/PaymentSettings');
const RuntimeSettings = require('../../models/RuntimeSettings');
const Configuracoes = require('../../models/Configuracoes');
const RecipeAudit = require('../../models/RecipeAudit');
const Reserva = require('../../models/Reserva');
const { migrarTenantPdv } = require('../../scripts/migrar-tenant-pdv');

const modelosDominio = [
  User, Product, Order, Comanda, Customer, Purchase, Despesa, StockMovement,
  Production, Recipe, HistoricoCusto, FechamentoCaixa, OperacaoFinanceira,
  Auditoria, MesasSettings, PaymentSettings, RuntimeSettings, Configuracoes,
  RecipeAudit, Reserva,
];

const criarTenant = async (slug) => {
  const tenant = {
    _id: new mongoose.Types.ObjectId(),
    nome: 'Café de teste',
    slug,
    telefone: '11999999999',
    endereco: 'Rua de teste, 10',
    ativo: true,
    plano: 'teste',
  };
  await Tenant.collection.insertOne(tenant);
  return tenant;
};

const mapear = (tenantId, assignments, planoRecursos = 'essencial', identidade = {}) => ({
  tenants: [{ id: String(tenantId), planoRecursos, ...identidade }],
  assignments,
});

const idsDaColecao = (model, tenantId, ids) => ({
  collection: model.collection.collectionName,
  tenantId: String(tenantId),
  ids: ids.map(String),
});

describe('migração tenant-scoped do PDV', () => {
  test('adiciona tenantId aos modelos operacionais sem alterar o plano legado', () => {
    expect(Tenant.schema.path('plano').enumValues).toEqual(['teste', 'mensal']);
    expect(Tenant.schema.path('planoRecursos').enumValues).toEqual(['essencial', 'pro', 'delivery']);
    expect(Tenant.schema.path('logoUrl')).toBeDefined();
    expect(Tenant.schema.path('corPrimaria')).toBeDefined();
    expect(Tenant.schema.path('corSecundaria')).toBeDefined();
    expect(Tenant.schema.path('appName')).toBeDefined();
    for (const model of modelosDominio) {
      expect(model.schema.path('tenantId')).toBeDefined();
      expect(model.schema.indexes().some(([keys]) => keys.tenantId === 1)).toBe(true);
    }
  });

  test('dry-run resume associações sem gravar tenantId ou plano de recursos', async () => {
    const tenant = await criarTenant('dry-run-cafe');
    const productId = new mongoose.Types.ObjectId();
    await Product.collection.insertOne({ _id: productId, codigo: 'DRY-1' });

    const result = await migrarTenantPdv({
      mapeamento: mapear(tenant._id, [idsDaColecao(Product, tenant._id, [productId])]),
      dryRun: true,
      modelos: [Product],
    });

    expect(result.dryRun).toBe(true);
    expect(result.collections).toMatchObject([{ collection: 'products', documents: 1, toAssociate: 1 }]);
    expect((await Product.collection.findOne({ _id: productId })).tenantId).toBeUndefined();
    expect((await Tenant.collection.findOne({ _id: tenant._id })).planoRecursos).toBeUndefined();
  });

  test('aborta mapa incompleto ou ambíguo antes de qualquer escrita', async () => {
    const primeiro = await criarTenant('mapa-incompleto');
    const productId = new mongoose.Types.ObjectId();
    await Product.collection.insertOne({ _id: productId, codigo: 'MAP-1' });

    await expect(migrarTenantPdv({
      mapeamento: mapear(primeiro._id, []),
      modelos: [Product],
    })).rejects.toThrow(/não mapeados/i);

    const segundo = await criarTenant('mapa-ambiguo');
    await expect(migrarTenantPdv({
      mapeamento: {
        tenants: [
          { id: String(primeiro._id), planoRecursos: 'essencial' },
          { id: String(segundo._id), planoRecursos: 'pro' },
        ],
        assignments: [
          idsDaColecao(Product, primeiro._id, [productId]),
          idsDaColecao(Product, segundo._id, [productId]),
        ],
      },
      modelos: [Product],
    })).rejects.toThrow(/ambígu/i);

    expect((await Product.collection.findOne({ _id: productId })).tenantId).toBeUndefined();
    expect((await Tenant.collection.findOne({ _id: primeiro._id })).planoRecursos).toBeUndefined();
    expect((await Tenant.collection.findOne({ _id: segundo._id })).planoRecursos).toBeUndefined();
  });

  test('migração válida e repetida associa cada documento a um único tenant', async () => {
    const tenant = await criarTenant('migracao-idempotente');
    const productId = new mongoose.Types.ObjectId();
    await Product.collection.insertOne({ _id: productId, codigo: 'MIG-1' });
    const mapeamento = mapear(tenant._id, [{
      collection: Product.collection.collectionName,
      tenantId: String(tenant._id),
      all: true,
    }]);

    const primeira = await migrarTenantPdv({ mapeamento, modelos: [Product] });
    const segunda = await migrarTenantPdv({ mapeamento, modelos: [Product] });

    expect(primeira.collections).toMatchObject([{ collection: 'products', documents: 1, toAssociate: 1 }]);
    expect(segunda.collections).toMatchObject([{ collection: 'products', documents: 1, toAssociate: 0 }]);
    expect(String((await Product.collection.findOne({ _id: productId })).tenantId)).toBe(String(tenant._id));
    expect((await Tenant.findById(tenant._id)).planoRecursos).toBe('essencial');
  });

  test('aborta referências entre tenants sem reatribuir documentos', async () => {
    const primeiro = await criarTenant('ref-cafe-a');
    const segundo = await criarTenant('ref-cafe-b');
    const customerId = new mongoose.Types.ObjectId();
    const orderId = new mongoose.Types.ObjectId();
    await Customer.collection.insertOne({ _id: customerId });
    await Order.collection.insertOne({ _id: orderId, clienteId: customerId });

    await expect(migrarTenantPdv({
      mapeamento: {
        tenants: [
          { id: String(primeiro._id), planoRecursos: 'essencial' },
          { id: String(segundo._id), planoRecursos: 'pro' },
        ],
        assignments: [
          idsDaColecao(Order, primeiro._id, [orderId]),
          idsDaColecao(Customer, segundo._id, [customerId]),
        ],
      },
      modelos: [Order, Customer],
    })).rejects.toThrow(/referência.*tenant|tenant.*referência/i);

    expect((await Order.collection.findOne({ _id: orderId })).tenantId).toBeUndefined();
    expect((await Customer.collection.findOne({ _id: customerId })).tenantId).toBeUndefined();
  });

  test('rejeita recursos e identidade inválidos sem atualizar tenant', async () => {
    const tenant = await criarTenant('identidade-invalida');

    await expect(migrarTenantPdv({
      mapeamento: mapear(tenant._id, [], 'enterprise'),
      modelos: [Product],
    })).rejects.toThrow(/planoRecursos/i);

    await expect(migrarTenantPdv({
      mapeamento: mapear(tenant._id, [], 'essencial', { logoUrl: 'javascript:alert(1)' }),
      modelos: [Product],
    })).rejects.toThrow(/Logo|HTTPS|caminho local/i);

    await expect(migrarTenantPdv({
      mapeamento: mapear(tenant._id, [], 'essencial', { corPrimaria: 'blue' }),
      modelos: [Product],
    })).rejects.toThrow(/corPrimaria/i);

    await Tenant.collection.updateOne({ _id: tenant._id }, { $set: { slug: 'slug_invalido' } });
    await expect(migrarTenantPdv({
      mapeamento: mapear(tenant._id, []),
      modelos: [Product],
    })).rejects.toThrow(/slug/i);

    expect((await Tenant.collection.findOne({ _id: tenant._id })).planoRecursos).toBeUndefined();
  });
});

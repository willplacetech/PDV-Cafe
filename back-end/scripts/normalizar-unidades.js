require('dotenv').config();
const mongoose = require('mongoose');
const Product = require('../models/Product');

const LEGACY_UNITS = {
  g: { unidade: 'kg', fator: 0.001 },
  mg: { unidade: 'kg', fator: 0.000001 },
  ml: { unidade: 'L', fator: 0.001 },
  l: { unidade: 'L', fator: 1 },
  pacote: { unidade: 'un', fator: 1 },
  caixa: { unidade: 'un', fator: 1 },
  lata: { unidade: 'un', fator: 1 },
  garrafa: { unidade: 'un', fator: 1 },
  cx: { unidade: 'un', fator: 1 },
  rolo: { unidade: 'un', fator: 1 },
  dz: { unidade: 'un', fator: 1 },
  kg: { unidade: 'kg', fator: 1 },
  L: { unidade: 'L', fator: 1 },
  un: { unidade: 'un', fator: 1 },
};

const CANONICAL_UNITS = ['kg', 'L', 'un'];
const UNIT_FIELDS = ['unidade', 'unidadeCompra', 'unidadeConteudo', 'unidadeVenda'];
const hasLegacyUnit = (produto) => !CANONICAL_UNITS.includes(produto.unidade) || UNIT_FIELDS.some((campo) => LEGACY_UNITS[produto[campo]]);
const legacyUnitOf = (produto) => UNIT_FIELDS.map((campo) => produto[campo]).find((unidade) => LEGACY_UNITS[unidade]) || UNIT_FIELDS.map((campo) => produto[campo]).find((unidade) => CANONICAL_UNITS.includes(unidade)) || 'un';
const round = (value, decimals) => Number(Number(value || 0).toFixed(decimals));

const countPlan = async (collection) => ({
  gramas: await collection.countDocuments({ $or: [{ unidade: 'g' }, { unidadeCompra: 'g' }, { unidadeConteudo: 'g' }] }),
  mililitros: await collection.countDocuments({ $or: [{ unidade: 'ml' }, { unidadeCompra: 'ml' }, { unidadeConteudo: 'ml' }] }),
  embalagens: await collection.countDocuments({ $or: [
    { unidade: { $in: ['pacote', 'caixa', 'lata', 'garrafa', 'cx'] } },
    { unidadeCompra: { $in: ['pacote', 'caixa', 'lata', 'garrafa', 'cx'] } },
  ] }),
  jaKg: await collection.countDocuments({ unidade: 'kg' }),
  jaL: await collection.countDocuments({ unidade: 'L' }),
  jaUn: await collection.countDocuments({ unidade: 'un' }),
});

const printPlan = (plan) => {
  console.log('='.repeat(50));
  console.log('CONTAGEM - O QUE SERÁ CONVERTIDO');
  console.log('='.repeat(50));
  console.log(`Gramas (g) -> kg:      ${plan.gramas}`);
  console.log(`Mililitros (ml) -> L:  ${plan.mililitros}`);
  console.log(`Pacote/Caixa -> un:    ${plan.embalagens}`);
  console.log('-'.repeat(50));
  console.log(`Já em kg (inalterado):  ${plan.jaKg}`);
  console.log(`Já em L (inalterado):   ${plan.jaL}`);
  console.log(`Já em un (inalterado):  ${plan.jaUn}`);
  console.log('='.repeat(50));
};

const buildUpdate = (produto) => {
  const unidadeLegada = legacyUnitOf(produto);
  if (!unidadeLegada) return null;
  const regra = LEGACY_UNITS[unidadeLegada];
  const casas = regra.unidade === 'un' ? 2 : 3;
  const quantidadeOrigem = Number(produto.quantidade ?? produto.conteudoPorEmbalagem ?? 1);
  const quantidadeNova = Math.max(regra.unidade === 'un' ? 0.01 : 0.001, round(quantidadeOrigem * regra.fator, casas));
  const precoCompra = Number(produto.precoCompra || 0);
  const custoBase = Number(produto.custoUnitarioBase || 0);
  const precoNovo = regra.fator < 1 ? round(precoCompra / 1000, 4) : precoCompra;
  const custoNovo = regra.fator < 1 && custoBase > 0 ? round(custoBase / 1000, 8) : custoBase;
  const estoqueInsumos = Number(produto.estoqueInsumos || 0);
  const estoqueNovo = regra.fator < 1 ? round(estoqueInsumos / 1000, 3) : estoqueInsumos;

  console.log(`  ${produto.nome}: ${unidadeLegada} -> ${regra.unidade}`);
  return {
    unidade: regra.unidade,
    unidadeCompra: regra.unidade,
    unidadeConteudo: regra.unidade,
    unidadeVenda: LEGACY_UNITS[produto.unidadeVenda]?.unidade || produto.unidadeVenda || regra.unidade,
    quantidade: quantidadeNova,
    conteudoPorEmbalagem: quantidadeNova,
    precoCompra: precoNovo,
    custoUnitarioBase: custoNovo,
    estoqueInsumos: estoqueNovo,
    estoqueEmbalagens: regra.unidade === 'un' ? Number(produto.estoqueEmbalagens ?? estoqueInsumos) : produto.estoqueEmbalagens,
  };
};

const backupCollection = async (collection, produtos) => {
  const nome = `produtos_unidades_backup_${new Date().toISOString().replace(/[-:.TZ]/g, '')}`;
  const db = mongoose.connection.db;
  await db.createCollection(nome);
  if (produtos.length) await db.collection(nome).insertMany(produtos, { ordered: false });
  return nome;
};

const validarFinal = async (collection) => {
  const inesperadas = await collection.countDocuments({ unidade: { $nin: CANONICAL_UNITS } });
  const custosZerados = await collection.countDocuments({ custoUnitarioBase: 0, precoCompra: { $gt: 0 } });
  const unidadesFinais = await collection.distinct('unidade');
  console.log(`Unidades no sistema: [ ${unidadesFinais.join(' | ')} ]`);
  console.log(`Produtos com unidade inesperada: ${inesperadas}`);
  console.log(`Produtos com preço > 0 e custo = 0: ${custosZerados}`);
  if (inesperadas > 0) throw new Error('A validação encontrou unidades fora de kg, L e un.');
  return { unidadesFinais, custosZerados };
};

const main = async () => {
  if (!process.env.MONGO_URI) throw new Error('Defina MONGO_URI antes de executar a migração.');
  await mongoose.connect(process.env.MONGO_URI);
  const collection = Product.collection;
  const produtos = await collection.find({}).toArray();
  const plan = await countPlan(collection);
  printPlan(plan);

  const candidatos = produtos.filter(hasLegacyUnit);
  console.log(`Registros únicos que serão alterados: ${candidatos.length}`);
  if (!process.argv.includes('--apply') || !process.argv.includes('--confirm')) {
    console.log('Modo consulta: nada foi alterado.');
    console.log('Para prosseguir, confira a contagem, faça seu backup e execute: npm run normalizar-unidades -- --apply --confirm');
    await mongoose.disconnect();
    return;
  }

  const backup = await backupCollection(collection, produtos);
  console.log(`Backup criado: ${backup}`);
  const updates = candidatos.map((produto) => ({
    updateOne: { filter: { _id: produto._id }, update: { $set: buildUpdate(produto) } },
  }));
  if (updates.length) await collection.bulkWrite(updates, { ordered: false });

  const zerados = await collection.find({ tipo: 'insumo', custoUnitarioBase: 0, precoCompra: { $gt: 0 }, conteudoPorEmbalagem: { $gt: 0 } }).toArray();
  for (const produto of zerados) {
    const rendimento = Number(produto.rendimento ?? produto.rendimentoPorUnidadeCompra ?? 0);
    const custo = rendimento > 0 ? Number(produto.precoCompra) / rendimento : Number(produto.precoCompra) / Number(produto.conteudoPorEmbalagem);
    await collection.updateOne({ _id: produto._id }, { $set: { custoUnitarioBase: custo } });
  }
  console.log(`Registros convertidos: ${updates.length}`);
  console.log(`Custos zerados recalculados: ${zerados.length}`);
  await validarFinal(collection);
  console.log('Migração concluída com sucesso.');
  await mongoose.disconnect();
};

main().catch(async (error) => {
  console.error(`Migração interrompida: ${error.message}`);
  await mongoose.disconnect();
  process.exitCode = 1;
});

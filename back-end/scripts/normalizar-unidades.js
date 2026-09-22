require('dotenv').config();
const mongoose = require('mongoose');

const LEGACY = {
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
};
const CANONICAL = ['kg', 'L', 'un'];
const round = (value, decimals = 6) => Number(Number(value || 0).toFixed(decimals));
const convert = (value, unit) => {
  const rule = LEGACY[unit];
  if (!rule) return { value, unit };
  return { value: round(Number(value || 0) * rule.fator, rule.unidade === 'un' ? 2 : 6), unit: rule.unidade };
};
const convertItem = (item, unitKey, quantityKey = 'quantidade') => {
  if (!item || !LEGACY[item[unitKey]]) return false;
  const result = convert(item[quantityKey], item[unitKey]);
  item[quantityKey] = result.value;
  item[unitKey] = result.unit;
  return true;
};

const transformProduct = (product) => {
  let changed = false;
  const sourceUnit = product.unidade || product.unidadeCompra || product.unidadeConteudo || 'un';
  const rule = LEGACY[sourceUnit];
  if (rule) {
    const quantidade = convert(product.quantidade ?? product.conteudoPorEmbalagem ?? 1, sourceUnit);
    product.unidade = rule.unidade;
    product.unidadeCompra = rule.unidade;
    product.unidadeConteudo = rule.unidade;
    product.conteudoPorEmbalagem = quantidade.value;
    if (product.quantidade !== undefined) product.quantidade = quantidade.value;
    if (product.precoCompra !== undefined) product.precoCompra = round(Number(product.precoCompra) * rule.fator, 4);
    if (product.custoUnitarioBase) product.custoUnitarioBase = round(Number(product.custoUnitarioBase) * rule.fator, 8);
    if (product.estoqueInsumos !== undefined) product.estoqueInsumos = round(Number(product.estoqueInsumos) * rule.fator, 6);
    changed = true;
  }
  if (LEGACY[product.unidadeVenda]) {
    product.unidadeVenda = convert(0, product.unidadeVenda).unit;
    changed = true;
  }
  if (Array.isArray(product.fichaTecnica)) {
    product.fichaTecnica.forEach((item) => { if (convertItem(item, 'unidade')) changed = true; });
  }
  return changed;
};

const transformDocument = (collection, document) => {
  let changed = false;
  if (collection === 'products') changed = transformProduct(document) || changed;
  if (collection === 'recipes') {
    if (LEGACY[document.unidadeRendimento]) { document.unidadeRendimento = convert(0, document.unidadeRendimento).unit; changed = true; }
    (document.ingredientes || []).forEach((item) => { if (convertItem(item, 'unidade')) changed = true; });
  }
  if (collection === 'productions') {
    if (LEGACY[document.unidadeRendimento]) { document.unidadeRendimento = convert(0, document.unidadeRendimento).unit; changed = true; }
    (document.insumos || []).forEach((item) => { if (convertItem(item, 'unidade')) changed = true; });
  }
  if (collection === 'purchases') {
    (document.itens || []).forEach((item) => {
      if (convertItem(item, 'unidadeConteudo', 'conteudoPorEmbalagem')) {
        item.quantidadeTotal = round(Number(item.qtdEmbalagens || 0) * Number(item.conteudoPorEmbalagem || 0));
        changed = true;
      }
      if (LEGACY[item.unidade]) { item.unidade = convert(0, item.unidade).unit; changed = true; }
    });
  }
  if (collection === 'orders' || collection === 'comandas') {
    (document.itens || []).forEach((item) => {
      if (LEGACY[item.unidadeVenda]) {
        const result = convert(item.quantidade, item.unidadeVenda);
        item.quantidade = result.value;
        item.unidadeVenda = result.unit;
        changed = true;
      }
      (item.insumosConsumidos || []).forEach((ingredient) => { if (convertItem(ingredient, 'unidade')) changed = true; });
    });
  }
  if (collection === 'stockmovements' && LEGACY[document.unidade]) {
    const result = convert(document.quantidade, document.unidade);
    document.quantidade = result.value;
    document.unidade = result.unit;
    changed = true;
  }
  return changed;
};

const unitPaths = {
  products: ['unidade', 'unidadeCompra', 'unidadeConteudo', 'unidadeVenda', 'fichaTecnica.unidade'],
  recipes: ['unidadeRendimento', 'ingredientes.unidade'],
  productions: ['unidadeRendimento', 'insumos.unidade'],
  purchases: ['itens.unidadeConteudo', 'itens.unidade'],
  orders: ['itens.unidadeVenda', 'itens.insumosConsumidos.unidade'],
  comandas: ['itens.unidadeVenda', 'itens.insumosConsumidos.unidade'],
  stockmovements: ['unidade'],
};

const countCollection = async (db, name) => {
  const paths = unitPaths[name] || [];
  const result = { docs: await db.collection(name).countDocuments(), legacy: 0 };
  if (!paths.length) return result;
  const or = paths.flatMap((path) => Object.keys(LEGACY).map((unit) => ({ [path]: unit })));
  result.legacy = await db.collection(name).countDocuments({ $or: or });
  return result;
};

const backupAll = async (db, names) => {
  const suffix = new Date().toISOString().replace(/[-:.TZ]/g, '');
  const backups = [];
  for (const name of names) {
    const backupName = `${name}_units_backup_${suffix}`;
    await db.createCollection(backupName);
    const documents = await db.collection(name).find({}).toArray();
    if (documents.length) await db.collection(backupName).insertMany(documents, { ordered: false });
    backups.push(backupName);
  }
  return backups;
};

const validateAll = async (db, names) => {
  const invalid = [];
  for (const name of names) {
    for (const path of unitPaths[name] || []) {
      const values = await db.collection(name).distinct(path);
      const unexpected = values.filter((value) => value && !CANONICAL.includes(value));
      if (unexpected.length) invalid.push({ collection: name, path, values: unexpected });
    }
  }
  if (invalid.length) throw new Error(`Unidades fora do padrão: ${JSON.stringify(invalid)}`);
  console.log('Validação final: apenas kg, L e un nas referências migradas.');
};

const main = async () => {
  if (!process.env.MONGO_URI) throw new Error('Defina MONGO_URI antes de executar a migração.');
  await mongoose.connect(process.env.MONGO_URI);
  const db = mongoose.connection.db;
  const allNames = (await db.listCollections().toArray())
    .map((item) => item.name)
    .filter((name) => !name.startsWith('system.') && !name.includes('_units_backup_'));
  const names = allNames.filter((name) => unitPaths[name]);
  console.log('='.repeat(60));
  console.log('CONTAGEM GLOBAL - CONSULTA ANTES DA MIGRAÇÃO');
  console.log('='.repeat(60));
  for (const name of names) {
    const count = await countCollection(db, name);
    console.log(`${name}: ${count.legacy} documento(s) com unidade legada de ${count.docs}`);
  }
  console.log('='.repeat(60));
  if (!process.argv.includes('--apply') || !process.argv.includes('--confirm')) {
    console.log('Modo consulta: nada foi alterado.');
    console.log('Faça o mongodump e confirme com: npm run normalizar-unidades -- --apply --confirm');
    await mongoose.disconnect();
    return;
  }

  const backups = await backupAll(db, names);
  console.log(`Backups criados: ${backups.join(', ')}`);
  let altered = 0;
  for (const name of names) {
    const collection = db.collection(name);
    const documents = await collection.find({}).toArray();
    const updates = documents.filter((document) => transformDocument(name, document)).map((document) => ({
      replaceOne: { filter: { _id: document._id }, replacement: document },
    }));
    if (updates.length) await collection.bulkWrite(updates, { ordered: false });
    altered += updates.length;
    console.log(`${name}: ${updates.length} documento(s) alterado(s)`);
  }
  await validateAll(db, names);
  console.log(`Migração global concluída: ${altered} documento(s) alterado(s).`);
  await mongoose.disconnect();
};

main().catch(async (error) => {
  console.error(`Migração interrompida: ${error.message}`);
  await mongoose.disconnect();
  process.exitCode = 1;
});

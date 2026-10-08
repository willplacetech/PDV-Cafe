require('dotenv').config();
const mongoose = require('mongoose');
const { isDeepStrictEqual } = require('node:util');
const Comanda = require('../models/Comanda');
const { normalizarComanda, normalizarNumero } = require('../utils/normalizarComanda');

const isPlainObject = (value) => value !== null
  && typeof value === 'object'
  && !Array.isArray(value)
  && !(value instanceof Date)
  && !value._bsontype
  && !Buffer.isBuffer(value);

const camposRemovidos = (original, normalizado, prefixo = '') => {
  const removidos = [];
  if (Array.isArray(original) && Array.isArray(normalizado)) {
    original.forEach((item, index) => {
      removidos.push(...camposRemovidos(item, normalizado[index], `${prefixo}[${index}]`));
    });
  } else if (isPlainObject(original) && isPlainObject(normalizado)) {
    for (const [chave, valor] of Object.entries(original)) {
      const caminho = prefixo ? `${prefixo}.${chave}` : chave;
      if (!Object.hasOwn(normalizado, chave)) {
        removidos.push(caminho);
      } else {
        removidos.push(...camposRemovidos(valor, normalizado[chave], caminho));
      }
    }
  }
  return removidos;
};

const obterNumero = (valor) => {
  if (valor === undefined || valor === null || valor === '') return null;
  const numero = normalizarNumero(valor);
  const inteiro = Number(numero);
  if (!Number.isSafeInteger(inteiro)) throw new Error(`numero fora do limite seguro: ${numero}`);
  return { numero, inteiro };
};

const criarBackup = async (db, documentos) => {
  const sufixo = new Date().toISOString().replace(/\D/g, '');
  const nome = `comandas_backup_padronizacao_${sufixo}`;
  await db.createCollection(nome);
  if (documentos.length) await db.collection(nome).insertMany(documentos, { ordered: false });
  return nome;
};

const main = async () => {
  if (!process.env.MONGO_URI) throw new Error('Defina MONGO_URI antes de executar a migração.');
  await mongoose.connect(process.env.MONGO_URI);

  const db = mongoose.connection.db;
  const collection = db.collection(Comanda.collection.name);
  const documentos = await collection.find({}).sort({ createdAt: 1, _id: 1 }).toArray();
  const numerosExistentes = [];
  for (const documento of documentos) {
    const encontrado = obterNumero(documento.numero);
    if (encontrado) numerosExistentes.push(encontrado);
  }

  let proximoNumero = numerosExistentes.reduce((maior, item) => Math.max(maior, item.inteiro), 0) + 1;
  const planos = [];
  const erros = [];
  const camposLegados = new Map();
  const numerosPlanejados = new Set();
  const documentosPorId = new Map(documentos.map((documento) => [String(documento._id), documento]));

  for (const documento of documentos) {
    try {
      const numeroExistente = obterNumero(documento.numero);
      const numero = numeroExistente?.numero || String(proximoNumero++).padStart(4, '0');
      if (numerosPlanejados.has(numero)) throw new Error(`numero duplicado após padronização: ${numero}`);
      numerosPlanejados.add(numero);

      const normalizado = await normalizarComanda(documento, numero);
      const removidos = camposRemovidos(documento, normalizado)
        .filter((campo) => campo !== 'total' && campo !== 'pagamentos' && !campo.startsWith('pagamentos.'));
      for (const campo of removidos) camposLegados.set(campo, (camposLegados.get(campo) || 0) + 1);
      planos.push({ _id: documento._id, documento: normalizado });
    } catch (error) {
      erros.push({ id: String(documento._id), erro: error.message });
    }
  }

  console.log(`Comandas analisadas: ${documentos.length}`);
  console.log(`Documentos que serão padronizados: ${planos.length}`);
  console.log(`Documentos que precisam de correção manual: ${erros.length}`);
  if (camposLegados.size) {
    console.log('Campos não reconhecidos pelo schema atual (serão removidos do documento após o backup):');
    for (const [campo, quantidade] of [...camposLegados].sort(([a], [b]) => a.localeCompare(b))) {
      console.log(`- ${campo}: ${quantidade}`);
    }
  }
  if (erros.length) {
    for (const item of erros) console.error(`- Comanda ${item.id}: ${item.erro}`);
    throw new Error('Migração cancelada: corrija os documentos inválidos antes de aplicar.');
  }

  const alterados = planos.filter(({ _id, documento }) => {
    const original = documentosPorId.get(String(_id));
    return !isDeepStrictEqual(original, documento);
  });
  console.log(`Documentos com alterações necessárias: ${alterados.length}`);

  if (!process.argv.includes('--apply') || !process.argv.includes('--confirm')) {
    console.log('Modo consulta: nenhum dado foi alterado.');
    console.log('Faça um mongodump e aplique com: npm run normalizar-comandas -- --apply --confirm');
    await mongoose.disconnect();
    return;
  }

  const backup = await criarBackup(db, documentos);
  console.log(`Backup completo criado: ${backup}`);
  if (alterados.length) {
    await collection.bulkWrite(alterados.map(({ _id, documento }) => ({
      replaceOne: { filter: { _id }, replacement: documento },
    })), { ordered: true });
  }

  const restantes = await collection.countDocuments({
    $or: [
      { numero: { $exists: false } },
      { numero: { $not: /^\d{4,}$/ } },
      { total: { $exists: true } },
      { pagamentos: { $exists: true } },
    ],
  });
  if (restantes) throw new Error(`Validação final falhou: ${restantes} documento(s) ainda fora do padrão.`);

  console.log(`Migração concluída: ${alterados.length} comanda(s) atualizada(s).`);
  await mongoose.disconnect();
};

main().catch(async (error) => {
  console.error(`Migração interrompida: ${error.message}`);
  await mongoose.disconnect();
  process.exitCode = 1;
});

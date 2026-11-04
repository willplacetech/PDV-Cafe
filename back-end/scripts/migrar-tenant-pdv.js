require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const databaseOptions = require('../utils/databaseOptions');
const Tenant = require('../models/Tenant');

const modelosPadrao = [
  require('../models/User'),
  require('../models/Product'),
  require('../models/Order'),
  require('../models/Comanda'),
  require('../models/Customer'),
  require('../models/Purchase'),
  require('../models/Despesa'),
  require('../models/StockMovement'),
  require('../models/Production'),
  require('../models/Recipe'),
  require('../models/HistoricoCusto'),
  require('../models/FechamentoCaixa'),
  require('../models/OperacaoFinanceira'),
  require('../models/Auditoria'),
  require('../models/MesasSettings'),
  require('../models/PaymentSettings'),
  require('../models/RuntimeSettings'),
  require('../models/Configuracoes'),
  require('../models/RecipeAudit'),
  require('../models/Reserva'),
  require('../models/PedidoEntrega'),
];

const recursosPermitidos = new Set(['essencial', 'pro', 'delivery']);
const camposIdentidade = ['logoUrl', 'corPrimaria', 'corSecundaria', 'appName'];

function exigirObjeto(valor, nome) {
  if (!valor || typeof valor !== 'object' || Array.isArray(valor)) {
    throw new Error(`${nome} deve ser um objeto.`);
  }
}

function validarChaves(valor, permitidas, nome) {
  const desconhecidas = Object.keys(valor).filter(chave => !permitidas.includes(chave));
  if (desconhecidas.length) {
    throw new Error(`${nome} contém campo(s) não permitido(s): ${desconhecidas.join(', ')}.`);
  }
}

function normalizarId(valor, nome) {
  if (typeof valor !== 'string' || !/^[a-f\d]{24}$/i.test(valor)) {
    throw new Error(`${nome} deve ser um ObjectId hexadecimal de 24 caracteres.`);
  }
  return valor.toLowerCase();
}

function validarMapeamento(mapeamento) {
  exigirObjeto(mapeamento, 'Mapeamento');
  validarChaves(mapeamento, ['tenants', 'assignments'], 'Mapeamento');

  if (!Array.isArray(mapeamento.tenants) || mapeamento.tenants.length === 0) {
    throw new Error('Mapeamento.tenants deve listar explicitamente cada Tenant.');
  }
  if (!Array.isArray(mapeamento.assignments)) {
    throw new Error('Mapeamento.assignments deve ser uma lista.');
  }

  const tenants = new Map();
  for (const [indice, item] of mapeamento.tenants.entries()) {
    exigirObjeto(item, `tenants[${indice}]`);
    validarChaves(item, ['id', 'planoRecursos', ...camposIdentidade], `tenants[${indice}]`);
    const id = normalizarId(item.id, `tenants[${indice}].id`);
    if (tenants.has(id)) throw new Error(`Tenant duplicado no mapeamento: ${id}.`);
    if (!recursosPermitidos.has(item.planoRecursos)) {
      throw new Error(`planoRecursos inválido para o Tenant ${id}.`);
    }

    const atualizacao = { planoRecursos: item.planoRecursos };
    for (const campo of camposIdentidade) {
      if (Object.hasOwn(item, campo)) atualizacao[campo] = item[campo];
    }
    tenants.set(id, atualizacao);
  }

  const assignments = new Map();
  for (const [indice, item] of mapeamento.assignments.entries()) {
    exigirObjeto(item, `assignments[${indice}]`);
    validarChaves(item, ['collection', 'tenantId', 'all', 'ids'], `assignments[${indice}]`);
    if (typeof item.collection !== 'string' || !item.collection.trim()) {
      throw new Error(`assignments[${indice}].collection é obrigatório.`);
    }
    const collection = item.collection.trim();
    const tenantId = normalizarId(item.tenantId, `assignments[${indice}].tenantId`);
    if (!tenants.has(tenantId)) {
      throw new Error(`Tenant não mapeado em assignments[${indice}].`);
    }
    const temTodos = item.all === true;
    const temIds = Array.isArray(item.ids);
    if (temTodos === temIds || (item.all !== undefined && item.all !== true)) {
      throw new Error(`assignments[${indice}] deve definir exatamente all:true ou ids[].`);
    }
    if (temIds && item.ids.length === 0) {
      throw new Error(`assignments[${indice}].ids não pode ser vazio.`);
    }

    let colecao = assignments.get(collection);
    if (!colecao) {
      colecao = { allTenantId: null, byId: new Map() };
      assignments.set(collection, colecao);
    }
    if (temTodos) {
      if (colecao.allTenantId || colecao.byId.size) {
        throw new Error(`Mapeamento ambíguo para a coleção ${collection}.`);
      }
      colecao.allTenantId = tenantId;
      continue;
    }
    if (colecao.allTenantId) {
      throw new Error(`Mapeamento ambíguo para a coleção ${collection}.`);
    }

    for (const valorId of item.ids) {
      const id = normalizarId(valorId, `assignments[${indice}].ids`);
      if (colecao.byId.has(id)) {
        throw new Error(`Mapeamento ambíguo para ${collection}/${id}.`);
      }
      colecao.byId.set(id, tenantId);
    }
  }

  return { tenants, assignments };
}

function obterValor(documento, caminho) {
  return caminho.split('.').reduce((valor, chave) => valor?.[chave], documento);
}

function obterValores(documento, partes) {
  if (documento == null) return [];
  if (Array.isArray(documento)) return documento.flatMap(item => obterValores(item, partes));
  if (partes.length === 0) return [documento];
  return obterValores(documento[partes[0]], partes.slice(1));
}

function extrairReferencias(schema, prefixo = '') {
  const referencias = [];
  for (const [nome, tipo] of Object.entries(schema.paths)) {
    const caminho = prefixo ? `${prefixo}.${nome}` : nome;
    if (tipo.options?.ref) referencias.push({ caminho, model: tipo.options.ref });
    if (tipo.caster?.options?.ref) referencias.push({ caminho, model: tipo.caster.options.ref });
    const subSchema = tipo.schema || tipo.caster?.schema;
    if (subSchema) referencias.push(...extrairReferencias(subSchema, caminho));
  }
  return referencias;
}

function correspondeFiltroParcial(documento, filtro) {
  return Object.entries(filtro || {}).every(([caminho, condicao]) => {
    const valor = obterValor(documento, caminho);
    if (condicao && typeof condicao === 'object' && !Array.isArray(condicao)) {
      return Object.entries(condicao).every(([operador, esperado]) => {
        if (operador === '$type') {
          if (esperado === 'string') return typeof valor === 'string';
          if (esperado === 'object') return valor !== null && typeof valor === 'object';
          return false;
        }
        if (operador === '$gt') return valor != null && valor > esperado;
        if (operador === '$exists') return (valor !== undefined) === esperado;
        if (operador === '$eq') return String(valor) === String(esperado);
        return false;
      });
    }
    return String(valor) === String(condicao);
  });
}

function serializarIndice(valor) {
  if (valor instanceof mongoose.Types.ObjectId) return valor.toHexString();
  if (valor instanceof Date) return valor.toISOString();
  if (Buffer.isBuffer(valor)) return valor.toString('hex');
  return valor;
}

function validarColisoesUnicas(model, documentos) {
  for (const [chaves, opcoes] of model.schema.indexes()) {
    if (!opcoes.unique || (Object.keys(chaves).length === 1 && chaves._id)) continue;
    const campos = Object.keys(chaves);
    const escopar = model.modelName !== 'User';
    const vistos = new Set();
    for (const { documento, tenantId } of documentos) {
      if (!correspondeFiltroParcial(documento, opcoes.partialFilterExpression)) continue;
      const valores = campos.map(campo => obterValor(documento, campo));
      if (opcoes.sparse && valores.every(valor => valor == null)) continue;
      const chave = JSON.stringify([
        ...(escopar ? [tenantId] : []),
        ...valores.map(serializarIndice),
      ]);
      if (vistos.has(chave)) {
        throw new Error(`Colisão em índice único de ${model.collection.collectionName}.`);
      }
      vistos.add(chave);
    }
  }
}

function validarReferencias(modelos, dadosPorColecao, mapasPorColecao) {
  const modeloPorNome = new Map(modelos.map(model => [model.modelName, model]));
  for (const model of modelos) {
    const collection = model.collection.collectionName;
    const documentos = dadosPorColecao.get(collection) || [];
    const associacoes = mapasPorColecao.get(collection) || new Map();
    const referencias = extrairReferencias(model.schema);

    for (const documento of documentos) {
      const tenantId = associacoes.get(String(documento._id));
      if (!tenantId) continue;
      for (const referencia of referencias) {
        const ids = obterValores(documento, referencia.caminho.split('.')).filter(Boolean);
        const alvoModel = modeloPorNome.get(referencia.model);
        for (const id of ids) {
          const idAlvo = String(id);
          if (referencia.model === 'Tenant') {
            if (idAlvo !== tenantId) {
              throw new Error(`Referência entre tenants em ${collection}.${referencia.caminho}.`);
            }
            continue;
          }
          if (!alvoModel) continue;
          const tenantAlvo = mapasPorColecao.get(alvoModel.collection.collectionName)?.get(idAlvo);
          if (tenantAlvo && tenantAlvo !== tenantId) {
            throw new Error(`Referência entre tenants em ${collection}.${referencia.caminho}.`);
          }
        }
      }
    }
  }
}

async function prepararPlano({ mapeamento, modelos, session }) {
  const { tenants: tenantsMapeados, assignments } = validarMapeamento(mapeamento);
  const tenantsExistentes = await Tenant.collection.find({}, { session }).toArray();
  const tenantsPorId = new Map(tenantsExistentes.map(tenant => [String(tenant._id), tenant]));

  if (tenantsPorId.size !== tenantsMapeados.size
    || [...tenantsPorId.keys()].some(id => !tenantsMapeados.has(id))) {
    throw new Error('Mapeamento incompleto ou contém Tenant inexistente.');
  }

  const atualizacoesTenant = [];
  const slugs = new Set();
  for (const [id, campos] of tenantsMapeados) {
    const tenantAtual = tenantsPorId.get(id);
    const tenantValidado = new Tenant({ ...tenantAtual, ...campos });
    await tenantValidado.validate();
    const slug = tenantValidado.slug.toLowerCase();
    if (slugs.has(slug)) throw new Error(`Slug duplicado: ${slug}.`);
    slugs.add(slug);
    atualizacoesTenant.push({ id: tenantAtual._id, campos });
  }

  const modelosPorColecao = new Map();
  for (const model of modelos) {
    const collection = model.collection.collectionName;
    if (!model.schema.path('tenantId')) {
      throw new Error(`Modelo ${model.modelName} não declara tenantId.`);
    }
    if (modelosPorColecao.has(collection)) {
      throw new Error(`Mais de um modelo associado à coleção ${collection}.`);
    }
    modelosPorColecao.set(collection, model);
  }

  for (const collection of assignments.keys()) {
    if (!modelosPorColecao.has(collection)) {
      throw new Error(`Coleção desconhecida no mapeamento: ${collection}.`);
    }
  }

  const documentosPorColecao = new Map();
  const associacoesPorColecao = new Map();
  const documentosAtualizar = [];
  const resumoColecoes = [];

  for (const [collection, model] of modelosPorColecao) {
    const documentos = await model.collection.find({}, { session }).toArray();
    const atribuicoes = assignments.get(collection) || { allTenantId: null, byId: new Map() };
    const idsEncontrados = new Set();
    const associacoes = new Map();
    let aAssociar = 0;
    const documentosEscopados = [];

    for (const documento of documentos) {
      const id = String(documento._id);
      idsEncontrados.add(id);
      const atribuido = atribuicoes.byId.get(id) || atribuicoes.allTenantId;
      const existente = documento.tenantId ? String(documento.tenantId) : null;
      if (atribuido && existente && atribuido !== existente) {
        throw new Error(`Tentativa de reatribuir ${collection}/${id} a outro Tenant.`);
      }
      const tenantId = atribuido || existente;
      if (!tenantId && model.modelName === 'User' && documento.role === 'admin_plataforma') continue;
      if (!tenantId) throw new Error(`Documentos não mapeados: ${collection} (${documentos.length}).`);
      if (!tenantsMapeados.has(tenantId)) {
        throw new Error(`Tenant inexistente no mapeamento para ${collection}/${id}.`);
      }
      associacoes.set(id, tenantId);
      documentosEscopados.push({ documento, tenantId });
      if (!existente) {
        aAssociar += 1;
        documentosAtualizar.push({ model, documento, tenantId });
      }
    }

    for (const id of atribuicoes.byId.keys()) {
      if (!idsEncontrados.has(id)) throw new Error(`Documento inexistente em ${collection}/${id}.`);
    }
    if (atribuicoes.allTenantId && atribuicoes.byId.size) {
      throw new Error(`Mapeamento ambíguo para a coleção ${collection}.`);
    }

    documentosPorColecao.set(collection, documentos);
    associacoesPorColecao.set(collection, associacoes);
    validarColisoesUnicas(model, documentosEscopados);
    resumoColecoes.push({ collection, documents: documentos.length, toAssociate: aAssociar });
  }

  validarReferencias(modelos, documentosPorColecao, associacoesPorColecao);
  return { atualizacoesTenant, documentosAtualizar, resumoColecoes };
}

async function migrarTenantPdv({ mapeamento, dryRun = false, modelos = modelosPadrao } = {}) {
  if (!mongoose.connection.readyState) {
    throw new Error('Conecte o Mongoose antes de executar a migração.');
  }
  if (!Array.isArray(modelos) || modelos.length === 0) {
    throw new Error('A migração exige ao menos um modelo tenant-scoped.');
  }

  const session = await mongoose.startSession();
  let resultado;
  try {
    await session.withTransaction(async () => {
      const plano = await prepararPlano({ mapeamento, modelos, session });
      resultado = {
        dryRun,
        tenants: plano.atualizacoesTenant.length,
        collections: plano.resumoColecoes,
      };
      if (dryRun) return;

      for (const tenant of plano.atualizacoesTenant) {
        await Tenant.collection.updateOne(
          { _id: tenant.id },
          { $set: tenant.campos },
          { session },
        );
      }
      for (const item of plano.documentosAtualizar) {
        const atualizacao = await item.model.collection.updateOne(
          { _id: item.documento._id, $or: [{ tenantId: { $exists: false } }, { tenantId: null }] },
          { $set: { tenantId: new mongoose.Types.ObjectId(item.tenantId) } },
          { session },
        );
        if (atualizacao.matchedCount !== 1) {
          throw new Error(`Documento alterado durante a migração: ${item.model.collection.collectionName}.`);
        }
      }
    });
  } finally {
    await session.endSession();
  }
  return resultado;
}

function lerArgumentos(argv) {
  let mapPath;
  let dryRun = false;
  for (let indice = 0; indice < argv.length; indice += 1) {
    if (argv[indice] === '--map' && !mapPath && argv[indice + 1]) {
      mapPath = argv[indice + 1];
      indice += 1;
    } else if (argv[indice] === '--dry-run' && !dryRun) {
      dryRun = true;
    } else {
      throw new Error('Uso: npm run tenant:migrate -- --map <arquivo.json> [--dry-run].');
    }
  }
  if (!mapPath) throw new Error('Informe um mapa explícito com --map <arquivo.json>.');
  return { mapPath, dryRun };
}

async function main() {
  const { mapPath, dryRun } = lerArgumentos(process.argv.slice(2));
  if (!process.env.MONGO_URI) throw new Error('Defina MONGO_URI antes de executar a migração.');
  const caminhoMapeamento = path.resolve(mapPath);
  const mapeamento = JSON.parse(fs.readFileSync(caminhoMapeamento, 'utf8'));

  await mongoose.connect(process.env.MONGO_URI, databaseOptions());
  try {
    const resultado = await migrarTenantPdv({ mapeamento, dryRun });
    console.log(JSON.stringify(resultado, null, 2));
    if (dryRun) console.log('Dry-run concluído; nenhuma alteração foi gravada.');
  } finally {
    await mongoose.disconnect();
  }
}

if (require.main === module) {
  main().catch(error => {
    console.error(`Migração tenant PDV falhou: ${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = { migrarTenantPdv, validarMapeamento, lerArgumentos };

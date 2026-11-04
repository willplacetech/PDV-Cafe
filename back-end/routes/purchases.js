const express = require('express');
const mongoose = require('mongoose');
const { body, validationResult } = require('express-validator');
const auth = require('../middleware/auth');
const Product = require('../models/Product');
const Purchase = require('../models/Purchase');
const Despesa = require('../models/Despesa');
const Auditoria = require('../models/Auditoria');
const StockMovement = require('../models/StockMovement');
const HistoricoCusto = require('../models/HistoricoCusto');
const { UNIDADES_PERMITIDAS, normalizarUnidade, validarQuantidadeCompra } = require('../utils/unidades');
const { paraBase, estoqueTotalBase } = require('../utils/estoqueInsumo');
const { normalizarEstoqueLegado, produtoControlaPeso } = require('../utils/estoqueProduto');
const { parsePagination, createPaginationResponse } = require('../utils/pagination');

const router = express.Router();
const units = UNIDADES_PERMITIDAS;
const costingMethods = ['media_ponderada', 'ultimo_preco'];
const snapshotFields = [
  'estoque',
  'estoquePesoKg',
  'estoqueEmbalagens',
  'estoqueInsumos',
  'estoqueConteudoAberto',
  'estoquePesoNormalizado',
  'precoCompra',
  'custoUnitarioBase',
  'conteudoPorEmbalagem',
  'unidadeConteudo',
];

const validate = (req, res) => {
  const errors = validationResult(req);
  if (errors.isEmpty()) return true;
  res.status(400).json({ errors: errors.array() });
  return false;
};

const quantidadeBase = (quantidade, unidade) => {
  const unidadeNormalizada = normalizarUnidade(unidade);
  if (!units.includes(unidadeNormalizada)) throw new Error(`Unidade de conteúdo inválida: ${unidade}`);
  return paraBase(quantidade, unidadeNormalizada);
};

const snapshotProduto = (produto) => Object.fromEntries(snapshotFields.map((campo) => [campo, produto[campo] ?? null]));
const aplicarSnapshot = (produto, snapshot) => snapshotFields.forEach((campo) => { produto[campo] = snapshot[campo]; });
const snapshotsIguais = (produto, snapshot) => snapshotFields.every((campo) => (produto[campo] ?? null) === (snapshot[campo] ?? null));
const erroCompra = (message, status = 400) => Object.assign(new Error(message), { status });
const dataValida = (valor) => /^\d{4}-\d{2}-\d{2}$/.test(String(valor))
  ? new Date(`${valor}T12:00:00.000Z`)
  : new Date(valor);
const vencimentoValido = (valor) => /^\d{4}-\d{2}-\d{2}$/.test(String(valor))
  ? new Date(`${valor}T23:59:59.999Z`)
  : new Date(valor);
const dataEmSaoPaulo = (valor) => {
  if (typeof valor === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(valor)) return valor;
  const date = valor instanceof Date ? valor : new Date(valor);
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${values.year}-${values.month}-${values.day}`;
};
const hojeEmSaoPaulo = () => dataEmSaoPaulo(new Date());

const validadoresCompra = [
  body('fornecedor').trim().notEmpty(),
  body('numeroNF').trim().notEmpty(),
  body('data').isISO8601(),
  body('dataVencimentoPagamento').optional().isISO8601(),
  body('metodoCusteio').isIn(costingMethods),
  body('itens').isArray({ min: 1 }),
  body('itens.*.produtoId').isMongoId(),
  body('itens.*.valorTotal').isFloat({ min: 0.000001 }),
  body('itens.*.qtdEmbalagens').isFloat({ min: 0.000001 }),
  body('itens.*.conteudoPorEmbalagem').isFloat({ min: 0.000001 }),
  body('itens.*.unidadeConteudo').isIn(units),
  body('itens').custom((itens) => Array.isArray(itens) && itens.every((item) => (
    validarQuantidadeCompra(item.qtdEmbalagens, item.conteudoPorEmbalagem, item.unidadeConteudo)
  ))).withMessage('Quantidade comprada inválida para a unidade informada'),
];

const carregarProdutos = async (itens, session) => {
  const ids = [...new Set(itens.map((item) => String(item.produtoId)))];
  const produtos = await Product.find({ _id: { $in: ids } }).session(session);
  if (produtos.length !== ids.length) throw erroCompra('Um ou mais produtos não foram encontrados', 404);
  return new Map(produtos.map((produto) => [String(produto._id), produto]));
};

const aplicarItensCompra = async (itensSolicitados, metodoCusteio, produtosPorId, session) => {
  const itens = [];
  for (const item of itensSolicitados) {
    const produto = produtosPorId.get(String(item.produtoId));
    const snapshotAntes = snapshotProduto(produto);
    const valorTotal = Number(item.valorTotal);
    const qtdEmbalagens = Number(item.qtdEmbalagens);
    const conteudoPorEmbalagem = Number(item.conteudoPorEmbalagem);
    const quantidadeTotal = Number((qtdEmbalagens * conteudoPorEmbalagem).toFixed(6));
    const quantidadeTotalBase = quantidadeBase(quantidadeTotal, item.unidadeConteudo);
    const custoUnitario = valorTotal / quantidadeTotalBase;
    const estoqueAtualBase = estoqueTotalBase(produto);
    const conteudoAtualBase = quantidadeBase(produto.conteudoPorEmbalagem || 0, produto.unidadeConteudo || produto.unidadeVenda || 'un');
    const conteudoNovoBase = quantidadeBase(conteudoPorEmbalagem, item.unidadeConteudo);
    const saldoExistente = estoqueAtualBase > 0 || Number(produto.estoque || 0) > 0 || Number(produto.estoqueEmbalagens || produto.estoqueInsumos || 0) > 0 || Number(produto.estoqueConteudoAberto || 0) > 0;
    if (saldoExistente && (conteudoAtualBase !== conteudoNovoBase || normalizarUnidade(produto.unidadeConteudo) !== normalizarUnidade(item.unidadeConteudo))) {
      throw erroCompra('A embalagem nao pode mudar enquanto existir saldo. Cadastre outro produto para a nova embalagem.');
    }

    const custoAtual = Number(produto.custoUnitarioBase || 0);
    const custoNovo = metodoCusteio === 'ultimo_preco'
      ? custoUnitario
      : (estoqueAtualBase > 0 && custoAtual > 0
        ? ((estoqueAtualBase * custoAtual) + valorTotal) / (estoqueAtualBase + quantidadeTotalBase)
        : custoUnitario);

    produto.conteudoPorEmbalagem = conteudoPorEmbalagem;
    produto.unidadeConteudo = item.unidadeConteudo;
    if (produto.tipo === 'venda') {
      if (produtoControlaPeso(produto)) normalizarEstoqueLegado(produto);
      produto.estoque = Number(produto.estoque || 0) + qtdEmbalagens;
      if (produtoControlaPeso(produto)) produto.estoquePesoKg = Number(produto.estoquePesoKg || 0) + quantidadeTotalBase / 1000;
    } else {
      produto.estoqueEmbalagens = Number(produto.estoqueEmbalagens || produto.estoqueInsumos || 0) + qtdEmbalagens;
      produto.estoqueInsumos = produto.estoqueEmbalagens;
    }
    produto.precoCompra = valorTotal / qtdEmbalagens;
    produto.custoUnitarioBase = custoNovo;
    await produto.save({ session });

    itens.push({
      produtoId: produto._id,
      valorTotal,
      qtdEmbalagens,
      conteudoPorEmbalagem,
      unidadeConteudo: item.unidadeConteudo,
      quantidadeTotal,
      custoUnitario,
      snapshotAntes,
      snapshotDepois: snapshotProduto(produto),
    });
  }
  return itens;
};

const gravarMovimentosEHistorico = async (itens, produtosPorId, compra, usuarioId, data, session) => {
  for (const item of itens) {
    const produto = produtosPorId.get(String(item.produtoId));
    await StockMovement.create([{
      produtoId: produto._id,
      produtoNome: produto.nome,
      tipo: 'entrada',
      origem: 'externo',
      destino: produto.tipo === 'venda' ? 'venda' : 'insumos',
      quantidade: item.qtdEmbalagens,
      quantidadePecas: item.qtdEmbalagens,
      unidade: produto.unidadeVenda || 'embalagem',
      referenciaId: compra._id,
      observacao: `Compra NF ${compra.numeroNF}`,
      createdBy: usuarioId,
    }], { session });
    await HistoricoCusto.create([{
      produtoId: produto._id,
      compraId: compra._id,
      custoUnitario: produto.custoUnitarioBase,
      motivo: 'compra',
      data,
    }], { session });
  }
};

const registrarAuditoria = async ({ req, compra, acao, justificativa, session, anterior }) => {
  const resumo = {
    fornecedor: compra.fornecedor,
    numeroNF: compra.numeroNF,
    data: compra.data,
    dataVencimentoPagamento: compra.dataVencimentoPagamento,
    valorTotal: compra.valorTotal,
    itens: compra.itens.map((item) => ({
      produtoId: String(item.produtoId),
      qtdEmbalagens: item.qtdEmbalagens,
      valorTotal: item.valorTotal,
    })),
  };
  await Auditoria.create([{
    usuarioSolicitante: req.user.id,
    usuarioAutorizou: req.user.id,
    acao,
    detalhes: `Compra ID ${compra._id}.${anterior ? ` Antes: ${JSON.stringify(anterior)}.` : ''} Depois: ${JSON.stringify(resumo)}.${justificativa ? ` Justificativa: ${justificativa}` : ''}`,
    ip: req.ip,
    sucesso: true,
  }], { session });
};

const obterContaPagar = async (compra, session) => {
  if (compra.contaPagarId) return Despesa.findById(compra.contaPagarId).session(session);
  return Despesa.findOne({ compraId: compra._id }).session(session);
};

const validarReversao = async (compra, session) => {
  if (!compra.itens.length || compra.itens.some((item) => !item.snapshotAntes || !item.snapshotDepois)) {
    throw erroCompra('Esta compra é anterior ao controle de reversão segura e não pode ser alterada ou excluída. Faça um ajuste de estoque separado.', 409);
  }
  const ultimaSnapshotPorProduto = new Map();
  for (const item of compra.itens) ultimaSnapshotPorProduto.set(String(item.produtoId), item.snapshotDepois);
  const movimentacaoPosterior = await StockMovement.findOne({
    produtoId: { $in: [...ultimaSnapshotPorProduto.keys()] },
    createdAt: { $gt: compra.updatedAt || compra.createdAt },
    referenciaId: { $ne: compra._id },
  }).select('_id').session(session);
  if (movimentacaoPosterior) {
    throw erroCompra('Há movimentações de estoque posteriores para os produtos desta compra. Não é seguro revertê-la.', 409);
  }

  const produtos = await Product.find({ _id: { $in: [...ultimaSnapshotPorProduto.keys()] } }).session(session);
  const produtosPorId = new Map(produtos.map((produto) => [String(produto._id), produto]));

  for (const [produtoId, snapshot] of ultimaSnapshotPorProduto) {
    const produto = produtosPorId.get(produtoId);
    if (!produto || !snapshotsIguais(produto, snapshot)) {
      throw erroCompra('O estoque ou custo de um produto mudou depois desta compra. Não é seguro revertê-la; faça um ajuste de estoque separado.', 409);
    }
  }
  return produtosPorId;
};

const reverterEfeitosCompra = async (compra, produtosPorId, usuarioId, session) => {
  for (const item of [...compra.itens].reverse()) {
    const produto = produtosPorId.get(String(item.produtoId));
    aplicarSnapshot(produto, item.snapshotAntes);
    await produto.save({ session });
    await StockMovement.create([{
      produtoId: produto._id,
      produtoNome: produto.nome,
      tipo: 'saida',
      origem: produto.tipo === 'venda' ? 'venda' : 'insumos',
      destino: 'externo',
      quantidade: item.qtdEmbalagens,
      quantidadePecas: item.qtdEmbalagens,
      unidade: produto.unidadeVenda || 'embalagem',
      referenciaId: compra._id,
      observacao: `Estorno da compra NF ${compra.numeroNF}`,
      createdBy: usuarioId,
    }], { session });
    await HistoricoCusto.create([{
      produtoId: produto._id,
      compraId: compra._id,
      custoUnitario: produto.custoUnitarioBase,
      motivo: 'estorno_compra',
      data: new Date(),
    }], { session });
  }
};

router.use(auth);
router.use(auth.allowRoles('admin'));

router.get('/', async (req, res) => {
  try {
    const pagination = parsePagination(req.query);
    const total = pagination.requested ? await Purchase.countDocuments() : null;
    let comprasQuery = Purchase.find()
      .populate('itens.produtoId', 'nome codigo unidadeConteudo conteudoPorEmbalagem')
      .populate('createdBy', 'username')
      .populate('contaPagarId', 'status dataVencimento')
      .sort({ data: -1, createdAt: -1, _id: -1 });
    if (pagination.requested) {
      const totalPaginas = Math.ceil(total / pagination.limite);
      const pagina = Math.min(pagination.pagina, Math.max(1, totalPaginas));
      comprasQuery = comprasQuery.skip((pagina - 1) * pagination.limite).limit(pagination.limite);
    } else {
      comprasQuery = comprasQuery.limit(200);
    }
    const compras = await comprasQuery;
    res.json(pagination.requested ? createPaginationResponse(compras, total, pagination) : compras);
  } catch (error) {
    if (error.status === 400) return res.status(400).json({ msg: error.message });
    res.status(500).json({ msg: error.message });
  }
});

router.get('/fornecedores', async (_req, res) => {
  try {
    const fornecedores = await Purchase.distinct('fornecedor', {
      status: { $ne: 'cancelada' },
      fornecedor: { $type: 'string', $ne: '' },
    });
    const fornecedoresUnicos = new Map();
    fornecedores.forEach((fornecedor) => {
      const nome = fornecedor.trim();
      const chave = nome.toLocaleLowerCase('pt-BR');
      if (nome && !fornecedoresUnicos.has(chave)) fornecedoresUnicos.set(chave, nome);
    });
    res.json([...fornecedoresUnicos.values()].sort((a, b) => a.localeCompare(b, 'pt-BR', { sensitivity: 'base' })));
  } catch (error) {
    res.status(500).json({ msg: error.message });
  }
});

router.get('/:id', async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ msg: 'ID inválido' });
  try {
    const compra = await Purchase.findById(req.params.id)
      .populate('itens.produtoId', 'nome codigo unidadeConteudo conteudoPorEmbalagem')
      .populate('createdBy', 'username')
      .populate('contaPagarId', 'status dataVencimento');
    if (!compra) return res.status(404).json({ msg: 'Compra não encontrada' });
    res.json(compra);
  } catch (error) {
    if (error.name === 'CastError') return res.status(400).json({ msg: 'ID inválido' });
    res.status(500).json({ msg: error.message });
  }
});

router.post('/', validadoresCompra, async (req, res) => {
  if (!validate(req, res)) return;
  let session;
  try {
    session = await mongoose.startSession();
    let compra;
    await session.withTransaction(async () => {
      const produtosPorId = await carregarProdutos(req.body.itens, session);
      const itens = await aplicarItensCompra(req.body.itens, req.body.metodoCusteio, produtosPorId, session);
      const valorTotalCompra = itens.reduce((total, item) => total + item.valorTotal, 0);
      const dataVencimentoPagamento = vencimentoValido(req.body.dataVencimentoPagamento || req.body.data);
      [compra] = await Purchase.create([{
        fornecedor: req.body.fornecedor,
        numeroNF: req.body.numeroNF,
        data: dataValida(req.body.data),
        dataVencimentoPagamento,
        metodoCusteio: req.body.metodoCusteio,
        itens,
        valorTotal: valorTotalCompra,
        createdBy: req.user.id,
      }], { session });

      const [contaPagar] = await Despesa.create([{
        descricao: `Compra NF ${compra.numeroNF}`,
        categoria: 'Fornecedores/Insumos',
        fornecedor: compra.fornecedor,
        valor: valorTotalCompra,
        dataVencimento: dataVencimentoPagamento,
        status: 'pendente',
        usuarioCadastro: req.user.id,
        origem: 'compra',
        compraId: compra._id,
      }], { session });
      compra.contaPagarId = contaPagar._id;
      await compra.save({ session });
      await gravarMovimentosEHistorico(itens, produtosPorId, compra, req.user.id, compra.data, session);
      await registrarAuditoria({ req, compra, acao: 'purchase_create', session });
    });
    res.status(201).json(await compra.populate('itens.produtoId', 'nome codigo'));
  } catch (error) {
    res.status(error.status || 400).json({ msg: error.message });
  } finally {
    if (session) await session.endSession();
  }
});

router.put('/:id', validadoresCompra, body('justificativa').trim().isLength({ min: 10, max: 1000 }), async (req, res) => {
  if (!validate(req, res)) return;
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ msg: 'ID inválido' });

  let session;
  try {
    session = await mongoose.startSession();
    let compra;
    await session.withTransaction(async () => {
      compra = await Purchase.findById(req.params.id).session(session);
      if (!compra) throw erroCompra('Compra não encontrada', 404);
      if (compra.status === 'cancelada') throw erroCompra('Não é possível editar uma compra cancelada', 409);
      if (dataEmSaoPaulo(compra.data) < hojeEmSaoPaulo() || dataEmSaoPaulo(req.body.data) < hojeEmSaoPaulo()) {
        throw erroCompra('Somente compras com data a partir de hoje podem ser alteradas', 409);
      }
      const contaPagar = await obterContaPagar(compra, session);
      if (contaPagar?.status === 'pago') throw erroCompra('Não é possível editar uma compra já paga. Faça um lançamento de ajuste.', 409);

      const resumoAnterior = {
        fornecedor: compra.fornecedor,
        numeroNF: compra.numeroNF,
        data: compra.data,
        dataVencimentoPagamento: compra.dataVencimentoPagamento,
        valorTotal: compra.valorTotal,
        itens: compra.itens.map((item) => ({
          produtoId: String(item.produtoId),
          qtdEmbalagens: item.qtdEmbalagens,
          valorTotal: item.valorTotal,
        })),
      };
      const produtosOriginais = await validarReversao(compra, session);
      await reverterEfeitosCompra(compra, produtosOriginais, req.user.id, session);

      const produtosPorId = await carregarProdutos(req.body.itens, session);
      const itens = await aplicarItensCompra(req.body.itens, req.body.metodoCusteio, produtosPorId, session);
      const valorTotal = itens.reduce((total, item) => total + item.valorTotal, 0);
      const dataVencimentoPagamento = vencimentoValido(req.body.dataVencimentoPagamento || req.body.data);

      compra.fornecedor = req.body.fornecedor;
      compra.numeroNF = req.body.numeroNF;
      compra.data = dataValida(req.body.data);
      compra.dataVencimentoPagamento = dataVencimentoPagamento;
      compra.metodoCusteio = req.body.metodoCusteio;
      compra.itens = itens;
      compra.valorTotal = valorTotal;
      await compra.save({ session });

      if (contaPagar) {
        contaPagar.descricao = `Compra NF ${compra.numeroNF}`;
        contaPagar.fornecedor = compra.fornecedor;
        contaPagar.valor = valorTotal;
        contaPagar.dataVencimento = dataVencimentoPagamento;
        contaPagar.status = dataVencimentoPagamento < new Date() ? 'atrasado' : 'pendente';
        await contaPagar.save({ session });
        compra.contaPagarId = contaPagar._id;
        await compra.save({ session });
      } else {
        const [novaContaPagar] = await Despesa.create([{
          descricao: `Compra NF ${compra.numeroNF}`,
          categoria: 'Fornecedores/Insumos',
          fornecedor: compra.fornecedor,
          valor: valorTotal,
          dataVencimento: dataVencimentoPagamento,
          status: 'pendente',
          usuarioCadastro: req.user.id,
          origem: 'compra',
          compraId: compra._id,
        }], { session });
        compra.contaPagarId = novaContaPagar._id;
        await compra.save({ session });
      }

      await gravarMovimentosEHistorico(itens, produtosPorId, compra, req.user.id, compra.data, session);
      await registrarAuditoria({
        req,
        compra,
        acao: 'purchase_update',
        justificativa: req.body.justificativa.trim(),
        session,
        anterior: resumoAnterior,
      });
    });
    res.json(await compra.populate('itens.produtoId', 'nome codigo'));
  } catch (error) {
    res.status(error.status || 400).json({ msg: error.message });
  } finally {
    if (session) await session.endSession();
  }
});

router.delete('/:id', body('justificativa').trim().isLength({ min: 10, max: 1000 }), async (req, res) => {
  if (!validate(req, res)) return;
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ msg: 'ID inválido' });

  let session;
  try {
    session = await mongoose.startSession();
    let compra;
    await session.withTransaction(async () => {
      compra = await Purchase.findById(req.params.id).session(session);
      if (!compra) throw erroCompra('Compra não encontrada', 404);
      if (compra.status === 'cancelada') throw erroCompra('Esta compra já foi excluída', 409);
      const contaPagar = await obterContaPagar(compra, session);
      if (contaPagar?.status === 'pago') throw erroCompra('Não é possível excluir uma compra já paga', 409);

      const produtosPorId = await validarReversao(compra, session);
      await reverterEfeitosCompra(compra, produtosPorId, req.user.id, session);
      if (contaPagar) await Despesa.deleteOne({ _id: contaPagar._id }, { session });

      compra.status = 'cancelada';
      compra.justificativaCancelamento = req.body.justificativa.trim();
      compra.canceladaEm = new Date();
      compra.canceladaPor = req.user.id;
      await compra.save({ session });
      await registrarAuditoria({
        req,
        compra,
        acao: 'purchase_cancel',
        justificativa: req.body.justificativa.trim(),
        session,
      });
    });
    res.json({ msg: 'Compra excluída e efeitos revertidos com sucesso', compraId: compra._id });
  } catch (error) {
    res.status(error.status || 400).json({ msg: error.message });
  } finally {
    if (session) await session.endSession();
  }
});

module.exports = router;

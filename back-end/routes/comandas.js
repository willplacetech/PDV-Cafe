const express = require('express');
const mongoose = require('mongoose');
const { createHash } = require('crypto');
const Comanda = require('../models/Comanda');
const Product = require('../models/Product');
const Order = require('../models/Order');
const Customer = require('../models/Customer');
const User = require('../models/User');
const auth = require('../middleware/auth');
const { exigirAutorizacao, verificarAutorizacao, exigirPrecoManual } = require('../middleware/exigirAutorizacao');
const { obterTaxasCartao } = require('../utils/taxasCartao');
const { calcularStatusPagamento, construirPagamento, formaPagamentoValida, normalizarFormaPagamento, normalizarPagamentos, saldoDevedor, totalPago, validarCancelamentoFinanceiro } = require('../utils/pagamento');
const { precoPorUnidade } = require('../utils/pesoProduto');
const { produtoControlaPeso } = require('../utils/estoqueProduto');
const { calcularPrecoComDesconto, calcularPrecoGrupo } = require('../utils/descontosQuantidade');
const { ajustarEstoque } = require('../utils/movimentarEstoqueVenda');

const { executarOperacaoFinanceira } = require('../utils/operacaoFinanceira');

const router = express.Router();
const money = (value) => Math.round((Number(value) + Number.EPSILON) * 100) / 100;
const permiteFracionar = (product) => !Number(product?.pesoPorUnidade) && (Boolean(product?.vendidoFracionado) || ['kg', 'L'].includes(product?.unidadeVenda));

const normalizarTelefoneCliente = (valor = '') => String(valor || '').replace(/\D/g, '');
const calcularSubtotalComanda = (itens = []) => money((Array.isArray(itens) ? itens : []).reduce((soma, item) => soma + Number(item?.precoUnitario || 0) * Number(item?.quantidade || 0), 0));
const calcularStatusPagamentoComanda = (comanda) => calcularStatusPagamento(comanda);
const precoManual = (valor) => {
  if (valor === undefined) return undefined;
  if (typeof valor !== 'number' || !Number.isFinite(valor) || valor < 0) throw new Error('Preço unitário inválido');
  return money(valor);
};
const aplicarPrecoManual = (item, valor) => {
  if (valor === undefined) return;
  item.precoUnitarioManual = precoManual(valor);
  item.precoUnitario = item.precoUnitarioManual;
  item.descontoQuantidade = 0;
  item.economiaQuantidade = 0;
  item.faixaDescontoQuantidade = undefined;
  item.grupoDescontoAtivo = false;
};


async function recalcularPrecosComanda(comanda, session) {
  const ids = [...new Set(comanda.itens.map((item) => String(item.produtoId)))];
  const produtos = await Product.find({ _id: { $in: ids } }).session(session);
  const porId = new Map(produtos.map((produto) => [String(produto._id), produto]));
  const quantidades = new Map();
  comanda.itens.forEach((item) => quantidades.set(String(item.produtoId), (quantidades.get(String(item.produtoId)) || 0) + Number(item.quantidade || 0)));
  const cartItens = comanda.itens.map((item) => ({ produto: porId.get(String(item.produtoId)), quantidade: Number(item.quantidade || 0) }));
  comanda.itens.forEach((item) => {
    const produto = porId.get(String(item.produtoId));
    if (item.precoUnitarioManual !== undefined) {
      aplicarPrecoManual(item, item.precoUnitarioManual);
      return;
    }
    if (!produto || item.tipoVenda === 'peso') return;
    const precoBase = precoPorUnidade(produto);
    const pricing = calcularPrecoComDesconto(produto, quantidades.get(String(item.produtoId)), precoBase);
    const grupoPricing = calcularPrecoGrupo(produto, quantidades.get(String(item.produtoId)), cartItens, pricing.precoUnitario);
    if (grupoPricing && grupoPricing.grupoAtivo && grupoPricing.precoUnitario < pricing.precoUnitario) {
      item.precoUnitario = grupoPricing.precoUnitario;
      item.precoUnitarioOriginal = grupoPricing.precoNormal;
      item.descontoQuantidade = grupoPricing.economiaUnitario;
      item.economiaQuantidade = grupoPricing.economiaTotal;
      item.faixaDescontoQuantidade = null;
      item.grupoDescontoAtivo = true;
      item.totalGrupo = grupoPricing.totalGrupo;
      item.faltamParaGrupo = 0;
    } else {
      item.precoUnitario = pricing.precoUnitario;
      item.precoUnitarioOriginal = pricing.precoNormal;
      item.descontoQuantidade = pricing.economiaUnitario;
      item.economiaQuantidade = pricing.economiaTotal;
      item.faixaDescontoQuantidade = pricing.faixaAplicada?.quantidadeMinima;
      item.grupoDescontoAtivo = false;
      item.totalGrupo = grupoPricing?.totalGrupo || 0;
      item.faltamParaGrupo = grupoPricing?.faltamParaGrupo || 0;
    }
  });
  comanda.valorTotal = comanda.utilizacaoInterna ? 0 : money(calcularSubtotalComanda(comanda.itens) + Number(comanda.taxaEntrega || 0));
  const pago = calcularStatusPagamento(comanda).valorPago;
  if (comanda.valorTotal < pago) throw new Error('A alteracao reduziria a comanda abaixo do valor ja recebido. Estorne o pagamento antes.');
  comanda.saldoDevedor = money(Math.max(0, comanda.valorTotal - pago));
}

router.get('/', auth, auth.allowRoles('admin', 'operador', 'garcom'), async (req, res) => {
  try {
    const filter = req.query.status === 'aberta'
      ? { status: { $in: ['aberta', 'rascunho'] } }
      : req.query.status ? { status: req.query.status } : {};
    const { dataInicio, dataFim } = req.query;
    if (dataInicio || dataFim) {
      const inicio = dataInicio ? new Date(`${dataInicio}T00:00:00.000Z`) : null;
      const fim = dataFim ? new Date(`${dataFim}T23:59:59.999Z`) : null;
      if ((inicio && Number.isNaN(inicio.getTime())) || (fim && Number.isNaN(fim.getTime()))) {
        return res.status(400).json({ msg: 'Período inválido' });
      }
      filter.createdAt = {};
      if (inicio) filter.createdAt.$gte = inicio;
      if (fim) filter.createdAt.$lte = fim;
    }
    const comandas = await Comanda.find(filter).sort({ createdAt: -1 }).populate('clienteId', 'nome telefone');
    res.json(comandas.map((comanda) => {
      const dados = comanda.toObject();
      if (dados.clienteId && typeof dados.clienteId === 'object') {
        dados.clienteTelefone = dados.clienteTelefone || dados.clienteId.telefone || '';
        if (!dados.clienteNome || dados.clienteNome === 'Cliente não identificado') dados.clienteNome = dados.clienteId.nome || dados.clienteNome;
        dados.clienteId = dados.clienteId._id;
      }
      return dados;
    }));
  } catch (err) { res.status(500).json({ msg: err.message }); }
});

router.get('/cozinha', auth, auth.allowRoles('admin', 'operador', 'cozinha'), async (req, res) => {
  try {
    const comandas = await Comanda.find({ status: 'aberta', 'itens.aFazer': true }).sort({ createdAt: 1 });
    res.json(comandas.map((comanda) => ({ ...comanda.toObject(), itens: comanda.itens.filter((item) => item.aFazer) })));
  } catch (err) { res.status(500).json({ msg: err.message }); }
});

router.post('/:id/cozinha/pronto', auth, auth.allowRoles('admin', 'operador', 'cozinha'), async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ msg: 'ID inválido' });
    const comanda = await Comanda.findOne({ _id: req.params.id, status: 'aberta' });
    if (!comanda?.entrega) return res.status(404).json({ msg: 'Entrega em preparo não encontrada' });
    if (!req.user.tenantId || String(comanda.entrega.tenantId) !== String(req.user.tenantId)) {
      return res.status(403).json({ msg: 'Entrega não pertence ao comércio deste usuário' });
    }
    if (!comanda.itens.some(item => item.aFazer)) return res.status(409).json({ msg: 'Esta entrega não possui itens de preparo pendentes' });
    comanda.entrega.preparoPronto = true;
    await comanda.save();
    res.json(comanda);
  } catch (error) {
    res.status(400).json({ msg: error.message });
  }
});

router.get('/a-receber', auth, auth.allowRoles('admin', 'operador'), async (req, res) => {
  try {
    const { clienteId, dataInicio, dataFim } = req.query;
    const filter = {
      status: 'aberta',
      utilizacaoInterna: { $ne: true },
      statusPagamento: { $in: ['pendente', 'parcial'] },
      valorTotal: { $gt: 0 },
    };
    if (clienteId && mongoose.isValidObjectId(clienteId)) filter.clienteId = clienteId;
    if (dataInicio || dataFim) {
      if ((dataInicio && !/^\d{4}-\d{2}-\d{2}$/.test(dataInicio)) || (dataFim && !/^\d{4}-\d{2}-\d{2}$/.test(dataFim))) {
        return res.status(400).json({ msg: 'Período inválido' });
      }
      filter.createdAt = {};
      if (dataInicio) filter.createdAt.$gte = new Date(`${dataInicio}T00:00:00.000Z`);
      if (dataFim) filter.createdAt.$lte = new Date(`${dataFim}T23:59:59.999Z`);
    }
    const comandas = await Comanda.find(filter)
      .populate('clienteId', 'nome telefone')
      .sort({ createdAt: -1 })
      .lean();
    res.json(comandas.map((comanda) => ({ ...comanda, ...calcularStatusPagamento(comanda) })));
  } catch (err) { res.status(500).json({ msg: err.message }); }
});

router.get('/:id', auth, auth.allowRoles('admin', 'operador', 'garcom'), async (req, res) => {
  try {
    const comanda = await Comanda.findById(req.params.id)
      .populate('clienteId', 'nome telefone')
      .populate('itens.produtoId', 'nome codigo');
    if (!comanda) return res.status(404).json({ msg: 'Comanda não encontrada' });
    res.json(comanda);
  } catch (err) {
    if (err.name === 'CastError') return res.status(400).json({ msg: 'ID inválido' });
    res.status(500).json({ msg: err.message });
  }
});

router.post('/', auth, auth.allowRoles('admin', 'operador', 'garcom'), exigirPrecoManual, async (req, res) => {
  const origemOffline = req.body.origemOffline;
  const origemConfere = (user) => origemOffline && typeof origemOffline === 'object' && !Array.isArray(origemOffline)
    && typeof origemOffline.ownerId === 'string' && origemOffline.ownerId === String(user?.id ?? user?._id ?? '')
    && Object.prototype.hasOwnProperty.call(origemOffline, 'tenantId')
    && (origemOffline.tenantId === null || typeof origemOffline.tenantId === 'string')
    && origemOffline.tenantId === (user?.tenantId ? String(user.tenantId) : null);
  const conflitoOrigem = () => res.status(409).json({ code: 'OFFLINE_ORIGIN_MISMATCH',
    msg: 'A origem desta venda nao corresponde ao operador e comercio atuais. A venda foi preservada para revisao.', recoverable: true });
  // Pedidos online antigos continuam sem snapshot; a fila nova sempre o envia.
  if (origemOffline !== undefined && !origemConfere(req.user)) return conflitoOrigem();
  const idTemporario = String(req.body.idTemporario || '').trim().slice(0, 100);
  const session = await mongoose.startSession();
  const idempotencyKey = req.header('Idempotency-Key');
  const idempotencyHash = createHash('sha256').update(JSON.stringify(req.body)).digest('hex');
  const buscarAnterior = () => Comanda.findOne({ atendente: req.user.username, idempotencyKey });
  const responderAnterior = (anterior) => {
    if (anterior.idempotencyHash && anterior.idempotencyHash !== idempotencyHash) {
      return res.status(409).json({ msg: 'Esta chave ja foi utilizada para outra comanda' });
    }
    return res.json(anterior);
  };
  try {
    if (idempotencyKey !== undefined && (typeof idempotencyKey !== 'string' || !/^[A-Za-z0-9._:-]{1,128}$/.test(idempotencyKey))) throw new Error('Chave de idempotencia invalida');
    if (idempotencyKey) {
      const anterior = await buscarAnterior();
      if (anterior) return responderAnterior(anterior);
    }
    if (idTemporario) {
      const existente = await Comanda.findOne({ idTemporario });
      if (existente) return idempotencyKey ? responderAnterior(existente) : res.status(200).json(existente);
    }
    session.startTransaction();
    const requestItens = Array.isArray(req.body.itens) ? req.body.itens : [];
    const quantidadesPorProduto = new Map();
    requestItens.forEach((item) => {
      quantidadesPorProduto.set(String(item.produtoId), (quantidadesPorProduto.get(String(item.produtoId)) || 0) + Number(item.quantidade || 0));
    });
    const productIds = [...new Set(requestItens.map((item) => item.produtoId))];
    const produtos = await Product.find({ _id: { $in: productIds } }).session(session);
    const porId = new Map(produtos.map((produto) => [String(produto._id), produto]));
    const cartItens = [];
    const itens = [];
    for (const item of requestItens) {
      const product = porId.get(String(item.produtoId));
      const vendaPorPeso = produtoControlaPeso(product) && item.tipoVenda === 'peso';
      const pesoVendidoKg = vendaPorPeso ? Number(item.pesoVendidoKg) : 0;
      const quantidade = vendaPorPeso ? 1 : Number(item.quantidade);
      if (!product || !Number.isFinite(quantidade) || quantidade < 0.001) throw new Error('Item inválido');
      if (vendaPorPeso && (!Number.isFinite(pesoVendidoKg) || pesoVendidoKg <= 0)) throw new Error('Informe o peso vendido');
      if (!permiteFracionar(product) && !Number.isInteger(quantidade)) throw new Error(`O produto "${product.nome}" é vendido somente por unidade`);
      const modificadores = Array.isArray(item.modificadores)
        ? item.modificadores.filter((value) => typeof value === 'string').slice(0, 10)
        : [];
      const precoNormal = vendaPorPeso ? money(pesoVendidoKg * Number(product.preco || 0)) : precoPorUnidade(product);
      const pricing = vendaPorPeso ? { precoUnitario: precoNormal, precoNormal, economiaUnitario: 0, economiaTotal: 0, faixaAplicada: null } : calcularPrecoComDesconto(product, quantidadesPorProduto.get(String(product._id)), precoNormal);
      cartItens.push({ produto: product, quantidade });
      itens.push({ produtoId: product.id, codigo: product.codigo, nome: product.nome, precoUnitario: pricing.precoUnitario, precoUnitarioOriginal: pricing.precoNormal, descontoQuantidade: pricing.economiaUnitario, economiaQuantidade: pricing.economiaTotal, faixaDescontoQuantidade: pricing.faixaAplicada?.quantidadeMinima, quantidade, quantidadePecas: vendaPorPeso ? 0 : quantidade, pesoVendidoKg: vendaPorPeso ? pesoVendidoKg : undefined, tipoVenda: vendaPorPeso ? 'peso' : (produtoControlaPeso(product) ? 'inteiro' : 'unidade'), unidadeVenda: product.unidadeVenda, pesoPorUnidade: product.pesoPorUnidade, unidadePeso: product.unidadePeso, modificadores, aFazer: Boolean(product.aFazer), insumosConsumidos: (product.fichaTecnica || []).map((ingrediente) => ({ produtoId: ingrediente.produtoId, quantidade: ingrediente.quantidade, unidade: ingrediente.unidade })) });
    }
    cartItens.forEach((cartItem, idx) => {
      const product = cartItem.produto;
      const item = itens[idx];
      if (item.tipoVenda === 'peso' || item.tipoVenda === 'inteiro') return;
      const grupoPricing = calcularPrecoGrupo(product, quantidadesPorProduto.get(String(product._id)), cartItens, item.precoUnitario);
      if (grupoPricing && grupoPricing.grupoAtivo && grupoPricing.precoUnitario < item.precoUnitario) {
        item.precoUnitario = grupoPricing.precoUnitario;
        item.precoUnitarioOriginal = grupoPricing.precoNormal;
        item.descontoQuantidade = grupoPricing.economiaUnitario;
        item.economiaQuantidade = grupoPricing.economiaTotal;
        item.faixaDescontoQuantidade = null;
        item.grupoDescontoAtivo = true;
        item.totalGrupo = grupoPricing.totalGrupo;
        item.faltamParaGrupo = 0;
      } else if (grupoPricing) {
        item.grupoDescontoAtivo = false;
        item.totalGrupo = grupoPricing.totalGrupo;
        item.faltamParaGrupo = grupoPricing.faltamParaGrupo;
      }
    });
    itens.forEach((item, index) => aplicarPrecoManual(item, requestItens[index].precoUnitarioManual));
    const rascunho = req.body.rascunho === true;
    if (!rascunho) await ajustarEstoque(itens, 'baixar', session);
    const temEntrega = req.body.entrega && typeof req.body.entrega === 'object' && !Array.isArray(req.body.entrega);
    const tipoAtendimento = temEntrega ? 'delivery' : ['balcao', 'retirada'].includes(req.body.tipoAtendimento) ? req.body.tipoAtendimento : 'mesa';
    const taxaEntrega = req.body.entrega && typeof req.body.entrega.taxaEntrega === 'number' && Number.isFinite(req.body.entrega.taxaEntrega) && req.body.entrega.taxaEntrega >= 0 ? money(req.body.entrega.taxaEntrega) : 0;
    const customer = req.body.clienteId ? await Customer.findById(req.body.clienteId).session(session) : null;
    if (req.body.clienteId && !customer) throw new Error('Cliente não encontrado');
    const utilizacaoInterna = Boolean(customer?.clienteInterno);
    const valorTotal = utilizacaoInterna ? 0 : money(calcularSubtotalComanda(itens) + taxaEntrega);
    const usuarioDelivery = temEntrega && mongoose.isValidObjectId(req.user.id) ? await User.findById(req.user.id).select('tenantId').session(session).catch(() => null) : null;
    // O comércio é capturado na venda; a entrega é processada depois, sem bloquear o PDV.
    const entrega = temEntrega ? { usuarioId: req.user.id, tenantId: usuarioDelivery?.tenantId, telefone: typeof req.body.entrega.telefone === 'string' ? req.body.entrega.telefone.slice(0, 30) : '', endereco: Object.fromEntries(['rua', 'numero', 'bairro', 'complemento', 'referencia'].map(campo => [campo, typeof req.body.entrega.endereco?.[campo] === 'string' ? req.body.entrega.endereco[campo].slice(0, campo === 'rua' ? 300 : campo === 'bairro' ? 120 : campo === 'numero' ? 30 : 200) : ''])), preservarEnderecoCadastrado: Boolean(req.body.entrega.preservarEnderecoCadastrado), taxaEntrega } : undefined;
    const clienteTelefone = normalizarTelefoneCliente(req.body.clienteTelefone || (temEntrega ? req.body.entrega.telefone : '')).slice(0, 30);
    const [comanda] = await Comanda.create([{ entrega, taxaEntrega, utilizacaoInterna, idTemporario: idTemporario || undefined, idempotencyKey: idempotencyKey || undefined, idempotencyHash: idempotencyKey ? idempotencyHash : undefined, clienteId: req.body.clienteId || undefined, clienteNome: customer?.clienteInterno ? customer.nome : req.body.clienteNome || 'Cliente não identificado', clienteTelefone, observacao: req.body.observacao, mesa: req.body.mesa, tipoAtendimento, statusBalcao: tipoAtendimento === 'balcao' ? 'aguardando' : undefined, itens, valorTotal, saldoDevedor: valorTotal, statusPagamento: utilizacaoInterna ? 'quitado' : 'pendente', estoqueBaixado: !rascunho && itens.length > 0, status: rascunho ? 'rascunho' : 'aberta', atendente: req.user.username }], { session });
    if (origemOffline !== undefined) {
      // Revalidar depois do trabalho assincromo e antes do commit: inclusive um
      // mesmo operador reassociado a outro comercio enquanto a venda processa.
      const liveUser = await User.findById(req.user.id).select('tenantId').lean();
      if (!origemConfere(liveUser)) { await session.abortTransaction(); return conflitoOrigem(); }
    }
    await session.commitTransaction();
    res.status(201).json(comanda);
  } catch (err) {
    if (session.inTransaction()) await session.abortTransaction();
    if (err.code === 11000 && idTemporario) {
      const existente = await Comanda.findOne({ idTemporario });
      if (existente) return idempotencyKey ? responderAnterior(existente) : res.status(200).json(existente);
    }
    if (idempotencyKey && (err.code === 11000 || err.hasErrorLabel?.('TransientTransactionError'))) {
      const anterior = await buscarAnterior();
      if (anterior) return responderAnterior(anterior);
    }
    res.status(err.status || 400).json({ msg: err.message, ...(err.acao ? { acao: err.acao } : {}) });
  } finally { await session.endSession(); }
});

router.patch('/:id/balcao/status', auth, auth.allowRoles('admin', 'operador', 'cozinha'), async (req, res) => {
  try {
    const statuses = ['aguardando', 'preparando', 'pronto', 'pago', 'entregue'];
    if (!statuses.includes(req.body.status)) return res.status(400).json({ msg: 'Status de balcão inválido' });
    const comanda = await Comanda.findOneAndUpdate({ _id: req.params.id, tipoAtendimento: 'balcao', status: 'aberta' }, { $set: { statusBalcao: req.body.status } }, { new: true });
    if (!comanda) return res.status(404).json({ msg: 'Pedido de balcão não encontrado ou já fechado' });
    res.json(comanda);
  } catch (error) { res.status(400).json({ msg: error.message }); }
});

router.post('/:id/itens', auth, auth.allowRoles('admin', 'operador', 'garcom'), exigirPrecoManual, async (req, res) => {
  const session = await mongoose.startSession();
  try {
    session.startTransaction();
    const comanda = await Comanda.findById(req.params.id).session(session);
    const product = await Product.findById(req.body.produtoId).session(session);
    const vendaPorPeso = produtoControlaPeso(product) && req.body.tipoVenda === 'peso';
    const pesoVendidoKg = vendaPorPeso ? Number(req.body.pesoVendidoKg) : 0;
    const quantidade = vendaPorPeso ? 1 : Number(req.body.quantidade);
    if (!comanda || !['aberta', 'rascunho'].includes(comanda.status)) return res.status(400).json({ msg: 'Comanda não está aberta' });
    if (!product || !Number.isFinite(quantidade) || quantidade < 0.001) return res.status(400).json({ msg: 'Item inválido' });
    if (vendaPorPeso && (!Number.isFinite(pesoVendidoKg) || pesoVendidoKg <= 0)) return res.status(400).json({ msg: 'Informe o peso vendido' });
    if (!permiteFracionar(product) && !Number.isInteger(quantidade)) return res.status(400).json({ msg: 'Este produto é vendido por unidade' });
    const modificadores = Array.isArray(req.body.modificadores)
      ? req.body.modificadores.filter((item) => typeof item === 'string').slice(0, 10)
      : [];
    comanda.itens.push({ produtoId: product.id, codigo: product.codigo, nome: product.nome, precoUnitario: vendaPorPeso ? money(pesoVendidoKg * Number(product.preco || 0)) : precoPorUnidade(product), quantidade, quantidadePecas: vendaPorPeso ? 0 : quantidade, pesoVendidoKg: vendaPorPeso ? pesoVendidoKg : undefined, tipoVenda: vendaPorPeso ? 'peso' : (produtoControlaPeso(product) ? 'inteiro' : 'unidade'), unidadeVenda: product.unidadeVenda, pesoPorUnidade: product.pesoPorUnidade, unidadePeso: product.unidadePeso, modificadores, aFazer: Boolean(product.aFazer), insumosConsumidos: (product.fichaTecnica || []).map((ingrediente) => ({ produtoId: ingrediente.produtoId, quantidade: ingrediente.quantidade, unidade: ingrediente.unidade })) });
    aplicarPrecoManual(comanda.itens[comanda.itens.length - 1], req.body.precoUnitarioManual);
    if (comanda.estoqueBaixado || comanda.status === 'aberta') {
      const itensParaBaixar = comanda.estoqueBaixado ? [comanda.itens[comanda.itens.length - 1]] : comanda.itens;
      await ajustarEstoque(itensParaBaixar, 'baixar', session);
      comanda.estoqueBaixado = true;
    }
    await recalcularPrecosComanda(comanda, session);
    comanda.valorTotal = comanda.utilizacaoInterna ? 0 : money(calcularSubtotalComanda(comanda.itens) + Number(comanda.taxaEntrega || 0));
    comanda.saldoDevedor = Math.max(0, comanda.valorTotal - Number(comanda.valorPago || 0));
    await comanda.save({ session });
    await session.commitTransaction();
    res.json(comanda);
  } catch (err) {
    if (session.inTransaction()) await session.abortTransaction();
    res.status(err.status || 400).json({ msg: err.message, ...(err.acao ? { acao: err.acao } : {}) });
  } finally { await session.endSession(); }
});

router.patch('/:id/itens/:itemId', auth, auth.allowRoles('admin', 'operador', 'garcom'), async (req, res) => {
  const session = await mongoose.startSession();
  try {
    session.startTransaction();
    const comanda = await Comanda.findById(req.params.id).session(session);
    const quantidade = Number(req.body.quantidade);
    if (!comanda || !['aberta', 'rascunho'].includes(comanda.status)) return res.status(400).json({ msg: 'Comanda não está aberta' });
    const item = comanda.itens.id(req.params.itemId);
    if (!item) return res.status(404).json({ msg: 'Item não encontrado' });
    if (!Number.isFinite(quantidade) || quantidade < 0.001) return res.status(400).json({ msg: 'Quantidade inválida' });
    const mudouPreco = Object.hasOwn(req.body, 'precoUnitarioManual') && req.body.precoUnitarioManual !== item.precoUnitarioManual;
    if (mudouPreco && quantidade < item.quantidade) return res.status(400).json({ msg: 'Altere o preço e reduza a quantidade em operações separadas' });
    if (mudouPreco) await verificarAutorizacao(req, 'alterar_preco');
    else if (quantidade < item.quantidade) await verificarAutorizacao(req, 'excluir_item');
    const product = await Product.findById(item.produtoId).session(session);
    if (product && !permiteFracionar(product) && !Number.isInteger(quantidade)) return res.status(400).json({ msg: 'Este produto é vendido por unidade' });
    const porPeso = item.tipoVenda === 'peso';
    const pesoNovo = porPeso ? (req.body.pesoVendidoKg == null ? Number(item.pesoVendidoKg) * quantidade / Number(item.quantidade) : Number(req.body.pesoVendidoKg)) : 0;
    if (porPeso && (!Number.isFinite(pesoNovo) || pesoNovo <= 0)) throw new Error('Informe o peso vendido');
    if (porPeso && pesoNovo < Number(item.pesoVendidoKg) && quantidade >= item.quantidade) await verificarAutorizacao(req, 'excluir_item');
    const estoqueBaixado = comanda.estoqueBaixado;
    if (estoqueBaixado) await ajustarEstoque([item], 'devolver', session);
    item.quantidade = quantidade;
    item.quantidadePecas = porPeso ? 0 : quantidade;
    if (porPeso) {
      item.pesoVendidoKg = pesoNovo;
      item.precoUnitario = money(pesoNovo * Number(product.preco || 0) / quantidade);
    }
    aplicarPrecoManual(item, req.body.precoUnitarioManual);
    if (estoqueBaixado) await ajustarEstoque([item], 'baixar', session);
    await recalcularPrecosComanda(comanda, session);
    comanda.valorTotal = comanda.utilizacaoInterna ? 0 : money(calcularSubtotalComanda(comanda.itens) + Number(comanda.taxaEntrega || 0));
    comanda.saldoDevedor = Math.max(0, comanda.valorTotal - Number(comanda.valorPago || 0));
    await comanda.save({ session });
    await session.commitTransaction();
    res.json(comanda);
  } catch (err) {
    if (session.inTransaction()) await session.abortTransaction();
    res.status(err.status || 400).json({ msg: err.message, ...(err.acao ? { acao: err.acao } : {}) });
  } finally { await session.endSession(); }
});

router.delete('/:id/itens/:itemId', auth, auth.allowRoles('admin', 'operador', 'garcom'), exigirAutorizacao('excluir_item'), async (req, res) => {
  const session = await mongoose.startSession();
  try {
    session.startTransaction();
    const comanda = await Comanda.findById(req.params.id).session(session);
    if (!comanda || !['aberta', 'rascunho'].includes(comanda.status)) return res.status(400).json({ msg: 'Comanda não está aberta' });
    const item = comanda.itens.id(req.params.itemId);
    if (!item) return res.status(404).json({ msg: 'Item não encontrado' });
    if (comanda.estoqueBaixado) await ajustarEstoque([item], 'devolver', session);
    comanda.itens.pull(req.params.itemId);
    await recalcularPrecosComanda(comanda, session);
    await comanda.save({ session });
    await session.commitTransaction();
    res.json(comanda);
  } catch (err) {
    if (session.inTransaction()) await session.abortTransaction();
    res.status(err.status || 400).json({ msg: err.message, ...(err.acao ? { acao: err.acao } : {}) });
  } finally { await session.endSession(); }
});

router.post('/:id/mover', auth, auth.allowRoles('admin', 'operador', 'garcom'), async (req, res) => {
  const session = await mongoose.startSession();
  try {
    session.startTransaction();
    const comandaOrigem = await Comanda.findById(req.params.id).session(session);
    if (!comandaOrigem || comandaOrigem.status !== 'aberta') {
      return res.status(400).json({ msg: 'Comanda não está aberta' });
    }

    const itemIds = Array.isArray(req.body.itemIds) ? req.body.itemIds.map(String) : [];
    if (!itemIds.length) return res.status(400).json({ msg: 'Selecione ao menos um item' });

    const itensSelecionados = comandaOrigem.itens.filter((item) => itemIds.includes(String(item._id)));
    if (itensSelecionados.length !== itemIds.length) {
      return res.status(400).json({ msg: 'Alguns itens selecionados não pertencem a esta comanda' });
    }

    const itensMovidos = itensSelecionados.map((item) => {
      const copia = item.toObject();
      delete copia._id;
      return copia;
    });
    const estoqueBaixado = comandaOrigem.estoqueBaixado;
    comandaOrigem.itens = comandaOrigem.itens.filter((item) => !itemIds.includes(String(item._id)));
    comandaOrigem.estoqueBaixado = estoqueBaixado && comandaOrigem.itens.length > 0;
    await recalcularPrecosComanda(comandaOrigem, session);
    const novaComanda = new Comanda({
      clienteId: comandaOrigem.clienteId,
      clienteNome: req.body.clienteNome || comandaOrigem.clienteNome || 'Cliente nao identificado',
      observacao: req.body.observacao || comandaOrigem.observacao,
      tipoAtendimento: comandaOrigem.tipoAtendimento, mesa: comandaOrigem.mesa,
      utilizacaoInterna: comandaOrigem.utilizacaoInterna,
      itens: itensMovidos, estoqueBaixado, atendente: req.user.username,
      status: 'aberta',
    });
    await recalcularPrecosComanda(novaComanda, session);
    await comandaOrigem.save({ session });
    await novaComanda.save({ session });

    await session.commitTransaction();
    res.json({ novaComanda, comandaOrigem });
  } catch (err) {
    if (session.inTransaction()) await session.abortTransaction();
    res.status(err.status || 400).json({ msg: err.message, ...(err.acao ? { acao: err.acao } : {}) });
  } finally { await session.endSession(); }
});

router.patch('/:id/cancelar', auth, auth.allowRoles('admin', 'operador', 'gerente', 'garcom'), exigirAutorizacao('cancelar_venda'), async (req, res) => {
  const session = await mongoose.startSession();
  try {
    session.startTransaction();
    const comanda = await Comanda.findById(req.params.id).session(session);
    if (!comanda || comanda.status !== 'aberta') return res.status(400).json({ msg: 'Comanda não está aberta' });
    const pedidos = await Order.find({ $or: [{ comandaId: comanda._id }, { _id: comanda.pedidoId }] }).session(session);
    validarCancelamentoFinanceiro(comanda.historicoPagamentos, pedidos);
    if (comanda.estoqueBaixado) await ajustarEstoque(comanda.itens, 'devolver', session);
    comanda.status = 'cancelada';
    comanda.estoqueBaixado = false;
    await comanda.save({ session });
    await Order.updateMany({ _id: { $in: pedidos.map(pedido => pedido._id) }, status: { $in: ['pendente', 'parcial'] } }, { $set: { status: 'cancelado' } }, { session });
    await session.commitTransaction();
    res.json(comanda);
  } catch (err) {
    if (session.inTransaction()) await session.abortTransaction();
    res.status(err.status || 400).json({ msg: err.message, ...(err.acao ? { acao: err.acao } : {}) });
  } finally { await session.endSession(); }
});

router.patch('/:id/receber-parcial', auth, auth.allowRoles('admin', 'operador', 'garcom'), async (req, res) => {
  try {
    const resultado = await executarOperacaoFinanceira({ req, tipo: 'comanda-receber', recursoId: req.params.id, executar: async (session, dataRecebimento) => {
    const comanda = await Comanda.findById(req.params.id).session(session);
    if (!comanda || comanda.status !== 'aberta') throw new Error('Comanda não está aberta');

    if (comanda.utilizacaoInterna) throw new Error('Consumo interno não aceita pagamentos');

    const formaPagamento = String(req.body.formaPagamento || 'dinheiro');
    if (!formaPagamentoValida(formaPagamento)) throw new Error('Forma de pagamento inválida');
    // Quitar um valor a receber pressupõe dinheiro real entrando; crédito na loja
    // não é recebimento e por isso não é aceito nesta rota.
    if (formaPagamento === 'credito_loja') throw new Error('Crédito na loja não é válido como recebimento em contas a receber');

    const valorTotal = Number(comanda.valorTotal || 0);
    const totalCobrado = valorTotal > 0 ? valorTotal : money(comanda.itens.reduce((soma, item) => soma + Number(item.precoUnitario || 0) * Number(item.quantidade || 0), 0));
    comanda.valorTotal = money(comanda.valorTotal || totalCobrado);

    const historico = Array.isArray(comanda.historicoPagamentos) ? comanda.historicoPagamentos : [];
    const saldoAtual = saldoDevedor(comanda.valorTotal, historico);
    if (saldoAtual <= 0) throw new Error('Esta comanda já está quitada');

    const pagamento = construirPagamento({
      valor: req.body.valorRecebido,
      formaPagamento,
      taxas: await obterTaxasCartao(),
      observacao: req.body.observacao,
      data: dataRecebimento,
      usuario: req.user?.username || 'sistema',
    });
    if (pagamento.valor > saldoAtual) {
      throw new Error(`O valor recebido (R$ ${pagamento.valor.toFixed(2)}) é maior que o saldo em aberto (R$ ${saldoAtual.toFixed(2)})`);
    }

    historico.push(pagamento);
    comanda.historicoPagamentos = historico;

    const atualizacao = calcularStatusPagamentoComanda(comanda);
    comanda.valorPago = atualizacao.valorPago;
    comanda.saldoDevedor = atualizacao.saldoDevedor;
    comanda.statusPagamento = atualizacao.statusPagamento;

    await comanda.save({ session });
    return comanda;
    } });
    if (resultado.comanda?.entrega) {
      setImmediate(() => {
        require('../utils/deliveryOutbox').processar()
          .catch(error => console.warn('[DeliveryLink] Não foi possível iniciar a integração da comanda fechada.', error.message));
      });
    }
    res.json(resultado);
  } catch (err) {
    res.status(err.status || 400).json({ msg: err.message, ...(err.acao ? { acao: err.acao } : {}) });
  }
});

router.patch('/:id/cliente', auth, auth.allowRoles('admin', 'operador', 'garcom'), async (req, res) => {
  const session = await mongoose.startSession();
  try {
    session.startTransaction();
    const comanda = await Comanda.findById(req.params.id).session(session);
    const telefone = normalizarTelefoneCliente(req.body.telefone);
    const nome = String(req.body.nome || '').trim();
    const enderecoEntrega = comanda.entrega?.preservarEnderecoCadastrado ? undefined : req.body.enderecoEntrega;
    if (!comanda || !telefone) throw new Error('Dados do cliente inválidos');

    let customer = comanda.clienteId ? await Customer.findById(comanda.clienteId).session(session) : null;
    if (customer?.clienteInterno) throw new Error('O Cliente Interno não aceita alteração de dados de contato');
    customer = customer || await Customer.findOne({ telefone }).session(session);
    if (customer) {
      if (nome) customer.nome = nome;
      else if (comanda.clienteNome && comanda.clienteNome !== 'Cliente não identificado') customer.nome = comanda.clienteNome;
      customer.telefone = telefone;
      if (enderecoEntrega && typeof enderecoEntrega === 'object' && !Array.isArray(enderecoEntrega)) customer.enderecoEntrega = enderecoEntrega;
      await customer.save({ session });
    } else {
      customer = new Customer({ nome: nome || comanda.clienteNome || 'Cliente não identificado', telefone, enderecoEntrega, createdBy: req.user.id });
      await customer.save({ session });
    }

    comanda.clienteId = customer.id;
    if (nome) comanda.clienteNome = nome;
    comanda.clienteTelefone = telefone;
    await comanda.save({ session });
    const order = comanda.pedidoId ? await Order.findByIdAndUpdate(comanda.pedidoId, { clienteId: customer.id, clienteNome: customer.nome, clienteTelefone: telefone }, { new: true, session }) : null;
    await session.commitTransaction();
    res.json({ customer, order });
  } catch (err) {
    if (session.inTransaction()) await session.abortTransaction();
    res.status(err.status || 400).json({ msg: err.message, ...(err.acao ? { acao: err.acao } : {}) });
  } finally { await session.endSession(); }
});

router.patch('/:id/detalhes', auth, auth.allowRoles('admin', 'operador', 'garcom'), async (req, res) => {
  const session = await mongoose.startSession();
  try {
    session.startTransaction();
    const comanda = await Comanda.findById(req.params.id).session(session);
    if (!comanda || !['aberta', 'rascunho'].includes(comanda.status)) throw new Error('Comanda não está aberta');
    const tipoAtendimento = req.body.tipoAtendimento;
    if (!['mesa', 'balcao', 'retirada', 'delivery'].includes(tipoAtendimento)) throw new Error('Tipo de atendimento inválido');
    if (tipoAtendimento === 'mesa' && !String(req.body.mesa || '').trim()) throw new Error('Selecione uma mesa');

    comanda.tipoAtendimento = tipoAtendimento;
    comanda.mesa = tipoAtendimento === 'mesa' ? String(req.body.mesa).trim().slice(0, 30) : undefined;
    if (req.body.clienteId && !mongoose.isValidObjectId(req.body.clienteId)) throw new Error('Cliente inválido');
    if (req.body.clienteId) comanda.clienteId = req.body.clienteId;
    else if (!req.body.clienteId) comanda.clienteId = undefined;
    const customer = comanda.clienteId ? await Customer.findById(comanda.clienteId).session(session) : null;
    if (comanda.clienteId && !customer) throw new Error('Cliente não encontrado');
    comanda.utilizacaoInterna = Boolean(customer?.clienteInterno);
    if (typeof req.body.clienteNome === 'string') comanda.clienteNome = req.body.clienteNome.trim().slice(0, 160) || 'Cliente não identificado';
    if (typeof req.body.clienteTelefone === 'string') comanda.clienteTelefone = normalizarTelefoneCliente(req.body.clienteTelefone).slice(0, 30);
    if (typeof req.body.observacao === 'string') comanda.observacao = req.body.observacao.trim().slice(0, 500);
    if (customer?.clienteInterno) comanda.clienteNome = customer.nome;

    if (tipoAtendimento === 'delivery') {
      const dadosEntrega = req.body.entrega;
      if (!dadosEntrega || typeof dadosEntrega !== 'object' || Array.isArray(dadosEntrega)) throw new Error('Informe os dados da entrega');
      const taxaEntrega = Number(dadosEntrega.taxaEntrega || 0);
      if (!Number.isFinite(taxaEntrega) || taxaEntrega < 0) throw new Error('Taxa de entrega inválida');
      const telefone = normalizarTelefoneCliente(dadosEntrega.telefone || comanda.clienteTelefone);
      if (!telefone) throw new Error('Informe o telefone do cliente');
      const endereco = Object.fromEntries(['rua', 'numero', 'bairro', 'complemento', 'referencia'].map(campo => [
        campo,
        typeof dadosEntrega.endereco?.[campo] === 'string' ? dadosEntrega.endereco[campo].trim().slice(0, campo === 'rua' ? 300 : campo === 'bairro' ? 120 : campo === 'numero' ? 30 : 200) : '',
      ]));
      comanda.taxaEntrega = money(taxaEntrega);
      comanda.clienteTelefone = telefone.slice(0, 30);
      comanda.entrega = {
        ...comanda.entrega?.toObject?.(),
        usuarioId: comanda.entrega?.usuarioId || req.user.id,
        tenantId: comanda.entrega?.tenantId || req.user.tenantId,
        telefone: comanda.clienteTelefone,
        endereco,
        taxaEntrega: comanda.taxaEntrega,
        preservarEnderecoCadastrado: Boolean(dadosEntrega.preservarEnderecoCadastrado),
        status: comanda.entrega?.status || 'pendente',
      };
    } else {
      comanda.entrega = undefined;
      comanda.taxaEntrega = 0;
    }
    comanda.valorTotal = comanda.utilizacaoInterna ? 0 : money(calcularSubtotalComanda(comanda.itens) + Number(comanda.taxaEntrega || 0));
    const pagamento = calcularStatusPagamento(comanda);
    if (comanda.valorTotal < pagamento.valorPago) throw new Error('A alteração reduziria a comanda abaixo do valor já recebido');
    comanda.saldoDevedor = saldoDevedor(comanda.valorTotal, comanda.historicoPagamentos);
    comanda.statusPagamento = calcularStatusPagamento(comanda).statusPagamento;
    await comanda.save({ session });
    await session.commitTransaction();
    res.json(comanda);
  } catch (error) {
    if (session.inTransaction()) await session.abortTransaction();
    res.status(400).json({ msg: error.message });
  } finally { await session.endSession(); }
});

router.post('/:id/reabrir', auth, auth.allowRoles('admin', 'gerente', 'operador'), exigirAutorizacao('reabrir_comanda'), async (req, res) => {
  const session = await mongoose.startSession();
  try {
    session.startTransaction();
    const comanda = await Comanda.findById(req.params.id).session(session);
    if (!comanda || comanda.status !== 'fechada') return res.status(409).json({ msg: 'Somente comandas fechadas podem ser reabertas' });
    if (comanda.utilizacaoInterna || comanda.entrega) return res.status(409).json({ msg: 'Consumo interno e delivery exigem regularização específica antes de reabrir' });
    const pedido = await Order.findById(comanda.pedidoId).session(session);
    if (!pedido || pedido.status === 'cancelado' || ['autorizada', 'processando'].includes(pedido.nfce?.status)) return res.status(409).json({ msg: 'Regularize o pedido e a situação fiscal antes de reabrir' });
    if (comanda.mesa && await Comanda.exists({ _id: { $ne: comanda._id }, mesa: comanda.mesa, status: 'aberta' }).session(session)) return res.status(409).json({ msg: 'A mesa já possui outra comanda aberta' });
    comanda.status = 'aberta';
    await comanda.save({ session });
    await session.commitTransaction();
    res.json(comanda);
  } catch (error) {
    if (session.inTransaction()) await session.abortTransaction();
    res.status(error.status || 400).json({ msg: error.message });
  } finally { await session.endSession(); }
});

router.post('/:id/fechar', auth, auth.allowRoles('admin', 'operador', 'gerente'), async (req, res) => {
  try {
    const resultado = await executarOperacaoFinanceira({ req, tipo: 'comanda-fechar', recursoId: req.params.id, executar: async (session, dataRecebimento) => {
    const comanda = await Comanda.findById(req.params.id).session(session);
    if (!comanda || !['aberta', 'rascunho'].includes(comanda.status) || !comanda.itens.length) throw new Error('Comanda sem itens ou já fechada');
    await recalcularPrecosComanda(comanda, session);
    let customer = comanda.clienteId ? await Customer.findById(comanda.clienteId).session(session) : null;
    const utilizacaoInterna = Boolean(customer?.clienteInterno || comanda.utilizacaoInterna || req.body.utilizacaoInterna);
    if (utilizacaoInterna && calcularStatusPagamento(comanda).valorPago > 0) throw new Error('Estorne os recebimentos antes de registrar consumo interno');
    const metodoPagamento = normalizarFormaPagamento(req.body.metodoPagamento);
    if (!comanda.estoqueBaixado) {
      await ajustarEstoque(comanda.itens, 'baixar', session);
      comanda.estoqueBaixado = true;
    }
    const subtotal = calcularSubtotalComanda(comanda.itens);
    const discount = money(req.body.desconto || 0);
    if (!Number.isFinite(discount) || discount < 0 || discount > subtotal) throw new Error('Desconto inválido');
    if (discount > money(subtotal * 0.1)) await verificarAutorizacao(req, 'desconto_acima_10');
    const total = utilizacaoInterna ? 0 : money(subtotal + Number(comanda.taxaEntrega || 0) - discount);

    const historico = Array.isArray(comanda.historicoPagamentos) ? comanda.historicoPagamentos : [];
    if (!utilizacaoInterna && total < totalPago(historico)) {
      throw new Error('O desconto não pode reduzir o total abaixo do valor já recebido. Regularize o estorno primeiro.');
    }
    comanda.valorTotal = total;
    const saldoRestante = saldoDevedor(total, historico);
    const pagamentoFinal = utilizacaoInterna ? 'credito_loja' : metodoPagamento;
    if (!utilizacaoInterna && saldoRestante > 0 && !pagamentoFinal) {
      throw new Error('Selecione uma forma de pagamento');
    }
    const taxasCartao = await obterTaxasCartao();
    if (saldoRestante > 0) {
      historico.push(construirPagamento({
        valor: saldoRestante,
        formaPagamento: pagamentoFinal,
        taxas: taxasCartao,
        observacao: 'Fechamento da comanda',
        data: dataRecebimento,
      usuario: req.user.username,
      }));
    }
    comanda.historicoPagamentos = historico;
    const situacaoFinal = calcularStatusPagamento({ valorTotal: total, historicoPagamentos: historico });

    const telefone = normalizarTelefoneCliente(req.body.telefone);
    const nome = String(req.body.nome || '').trim();
    const enderecoEntrega = !comanda.entrega?.preservarEnderecoCadastrado && req.body.enderecoEntrega && typeof req.body.enderecoEntrega === 'object' && !Array.isArray(req.body.enderecoEntrega)
      ? Object.fromEntries(['rua', 'numero', 'bairro', 'complemento', 'referencia'].map(campo => [campo, typeof req.body.enderecoEntrega[campo] === 'string' ? req.body.enderecoEntrega[campo].slice(0, campo === 'rua' ? 300 : campo === 'bairro' ? 120 : campo === 'numero' ? 30 : 200).trim() : '']))
      : undefined;
    if (telefone && !customer?.clienteInterno) {
      customer = customer || await Customer.findOne({ telefone }).session(session);
      if (customer) {
        if (nome) customer.nome = nome;
        else if (comanda.clienteNome && comanda.clienteNome !== 'Cliente não identificado') customer.nome = comanda.clienteNome;
        customer.telefone = telefone;
        if (enderecoEntrega) customer.enderecoEntrega = enderecoEntrega;
        await customer.save({ session });
      } else {
        customer = new Customer({ nome: nome || comanda.clienteNome || 'Cliente não identificado', telefone, enderecoEntrega, createdBy: req.user.id });
        await customer.save({ session });
      }
    } else if (customer && !customer.clienteInterno && (nome || enderecoEntrega)) {
      if (nome) customer.nome = nome;
      if (enderecoEntrega) customer.enderecoEntrega = enderecoEntrega;
      await customer.save({ session });
    }
    const pedidoAnterior = comanda.pedidoId ? await Order.findById(comanda.pedidoId).session(session) : null;
    if (comanda.pedidoId && !pedidoAnterior) throw new Error('Pedido vinculado ausente; regularize antes de fechar');
    const order = pedidoAnterior || new Order();
    order.set({
      itens: comanda.itens,
      tipoAtendimento: comanda.tipoAtendimento || 'mesa',
      subtotal,
      taxaEntrega: Number(comanda.taxaEntrega || 0),
      desconto: discount,
      utilizacaoInterna,
      total,
      clienteId: customer?.id || comanda.clienteId,
      clienteNome: customer?.nome || comanda.clienteNome,
      clienteTelefone: customer?.telefone || telefone,
      atendente: req.user.username,
      comandaId: comanda.id,
      status: utilizacaoInterna ? 'pago' : (situacaoFinal.saldoDevedor > 0 ? 'parcial' : 'pago'),
      pagamentos: [],
    });
    await order.save({ session });
    if (customer && !utilizacaoInterna && !pedidoAnterior) {
      await Customer.findByIdAndUpdate(customer.id, { $inc: { cafesFidelidade: 1 } }, { session });
      comanda.clienteId = customer.id;
      comanda.clienteTelefone = customer.telefone || telefone;
      if (nome) comanda.clienteNome = nome;
    }
    comanda.status = 'fechada';
    comanda.pedidoId = order.id;
    comanda.desconto = discount;
    comanda.valorTotal = total;
    comanda.utilizacaoInterna = utilizacaoInterna;
    comanda.valorPago = situacaoFinal.valorPago;
    comanda.saldoDevedor = situacaoFinal.saldoDevedor;
    comanda.statusPagamento = utilizacaoInterna ? 'quitado' : situacaoFinal.statusPagamento;
    await comanda.save({ session });
    return { comanda, pedido: { ...order.toObject(), pagamentos: normalizarPagamentos(comanda.historicoPagamentos) } };
    } });
    res.json(resultado);
  } catch (err) {
    res.status(err.status || 400).json({ msg: err.message, ...(err.acao ? { acao: err.acao } : {}) });
  }
});

module.exports = router;
module.exports.normalizarTelefoneCliente = normalizarTelefoneCliente;
module.exports.calcularSubtotalComanda = calcularSubtotalComanda;
module.exports.calcularStatusPagamentoComanda = calcularStatusPagamentoComanda;

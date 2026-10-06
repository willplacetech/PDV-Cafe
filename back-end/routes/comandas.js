const express = require('express');
const mongoose = require('mongoose');
const { createHash } = require('crypto');
const Comanda = require('../models/Comanda');
const Product = require('../models/Product');
const Order = require('../models/Order');
const Customer = require('../models/Customer');
const User = require('../models/User');
const auth = require('../middleware/auth');
const { obterTaxasCartao } = require('../utils/taxasCartao');
const { calcularStatusPagamento, construirPagamento, formaPagamentoValida, normalizarFormaPagamento, saldoDevedor, validarCancelamentoFinanceiro } = require('../utils/pagamento');
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

async function recalcularPrecosComanda(comanda, session) {
  const ids = [...new Set(comanda.itens.map((item) => String(item.produtoId)))];
  const produtos = await Product.find({ _id: { $in: ids } }).session(session);
  const porId = new Map(produtos.map((produto) => [String(produto._id), produto]));
  const quantidades = new Map();
  comanda.itens.forEach((item) => quantidades.set(String(item.produtoId), (quantidades.get(String(item.produtoId)) || 0) + Number(item.quantidade || 0)));
  const cartItens = comanda.itens.map((item) => ({ produto: porId.get(String(item.produtoId)), quantidade: Number(item.quantidade || 0) }));
  comanda.itens.forEach((item) => {
    const produto = porId.get(String(item.produtoId));
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
  comanda.valorTotal = money(calcularSubtotalComanda(comanda.itens) + Number(comanda.taxaEntrega || 0));
  const pago = calcularStatusPagamento(comanda).valorPago;
  if (comanda.valorTotal < pago) throw new Error('A alteracao reduziria a comanda abaixo do valor ja recebido. Estorne o pagamento antes.');
  comanda.saldoDevedor = money(Math.max(0, comanda.valorTotal - pago));
}

router.get('/', auth, auth.allowRoles('admin', 'operador', 'garcom'), async (req, res) => {
  try {
    const filter = req.query.status ? { status: req.query.status } : {};
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
    res.json(await Comanda.find(filter).sort({ createdAt: -1 }));
  } catch (err) { res.status(500).json({ msg: err.message }); }
});

router.get('/cozinha', auth, auth.allowRoles('admin', 'operador', 'cozinha'), async (req, res) => {
  try {
    const comandas = await Comanda.find({ status: 'aberta', 'itens.aFazer': true }).sort({ createdAt: 1 });
    res.json(comandas.map((comanda) => ({ ...comanda.toObject(), itens: comanda.itens.filter((item) => item.aFazer) })));
  } catch (err) { res.status(500).json({ msg: err.message }); }
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

router.post('/', auth, auth.allowRoles('admin', 'operador', 'garcom'), async (req, res) => {
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
    await ajustarEstoque(itens, 'baixar', session);
    const tipoAtendimento = req.body.tipoAtendimento === 'balcao' ? 'balcao' : 'mesa';
    const taxaEntrega = req.body.entrega && typeof req.body.entrega.taxaEntrega === 'number' && Number.isFinite(req.body.entrega.taxaEntrega) && req.body.entrega.taxaEntrega >= 0 ? money(req.body.entrega.taxaEntrega) : 0;
    const valorTotal = money(calcularSubtotalComanda(itens) + taxaEntrega);
    const usuarioDelivery = req.body.entrega && mongoose.isValidObjectId(req.user.id) ? await User.findById(req.user.id).select('tenantId').session(session).catch(() => null) : null;
    // O comércio é capturado na venda; a entrega é processada depois, sem bloquear o PDV.
    const entrega = req.body.entrega && typeof req.body.entrega === 'object' && !Array.isArray(req.body.entrega) ? { usuarioId: req.user.id, tenantId: usuarioDelivery?.tenantId, telefone: typeof req.body.entrega.telefone === 'string' ? req.body.entrega.telefone.slice(0, 30) : '', endereco: Object.fromEntries(['rua', 'numero', 'bairro', 'complemento', 'referencia'].map(campo => [campo, typeof req.body.entrega.endereco?.[campo] === 'string' ? req.body.entrega.endereco[campo].slice(0, 300) : ''])), taxaEntrega } : undefined;
    const [comanda] = await Comanda.create([{ entrega, taxaEntrega, idTemporario: idTemporario || undefined, idempotencyKey: idempotencyKey || undefined, idempotencyHash: idempotencyKey ? idempotencyHash : undefined, clienteId: req.body.clienteId || undefined, clienteNome: req.body.clienteNome || 'Cliente não identificado', observacao: req.body.observacao, mesa: req.body.mesa, tipoAtendimento, statusBalcao: tipoAtendimento === 'balcao' ? 'aguardando' : undefined, itens, valorTotal, saldoDevedor: valorTotal, statusPagamento: 'pendente', estoqueBaixado: itens.length > 0, atendente: req.user.username }], { session });
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
    res.status(400).json({ msg: err.message });
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

router.post('/:id/itens', auth, auth.allowRoles('admin', 'operador', 'garcom'), async (req, res) => {
  const session = await mongoose.startSession();
  try {
    session.startTransaction();
    const comanda = await Comanda.findById(req.params.id).session(session);
    const product = await Product.findById(req.body.produtoId).session(session);
    const vendaPorPeso = produtoControlaPeso(product) && req.body.tipoVenda === 'peso';
    const pesoVendidoKg = vendaPorPeso ? Number(req.body.pesoVendidoKg) : 0;
    const quantidade = vendaPorPeso ? 1 : Number(req.body.quantidade);
    if (!comanda || comanda.status !== 'aberta') return res.status(400).json({ msg: 'Comanda não está aberta' });
    if (!product || !Number.isFinite(quantidade) || quantidade < 0.001) return res.status(400).json({ msg: 'Item inválido' });
    if (vendaPorPeso && (!Number.isFinite(pesoVendidoKg) || pesoVendidoKg <= 0)) return res.status(400).json({ msg: 'Informe o peso vendido' });
    if (!permiteFracionar(product) && !Number.isInteger(quantidade)) return res.status(400).json({ msg: 'Este produto é vendido por unidade' });
    const modificadores = Array.isArray(req.body.modificadores)
      ? req.body.modificadores.filter((item) => typeof item === 'string').slice(0, 10)
      : [];
    comanda.itens.push({ produtoId: product.id, codigo: product.codigo, nome: product.nome, precoUnitario: vendaPorPeso ? money(pesoVendidoKg * Number(product.preco || 0)) : precoPorUnidade(product), quantidade, quantidadePecas: vendaPorPeso ? 0 : quantidade, pesoVendidoKg: vendaPorPeso ? pesoVendidoKg : undefined, tipoVenda: vendaPorPeso ? 'peso' : (produtoControlaPeso(product) ? 'inteiro' : 'unidade'), unidadeVenda: product.unidadeVenda, pesoPorUnidade: product.pesoPorUnidade, unidadePeso: product.unidadePeso, modificadores, aFazer: Boolean(product.aFazer), insumosConsumidos: (product.fichaTecnica || []).map((ingrediente) => ({ produtoId: ingrediente.produtoId, quantidade: ingrediente.quantidade, unidade: ingrediente.unidade })) });
    await ajustarEstoque([comanda.itens[comanda.itens.length - 1]], 'baixar', session);
    await recalcularPrecosComanda(comanda, session);
    comanda.valorTotal = money(calcularSubtotalComanda(comanda.itens) + Number(comanda.taxaEntrega || 0));
    comanda.saldoDevedor = Math.max(0, comanda.valorTotal - Number(comanda.valorPago || 0));
    comanda.estoqueBaixado = true;
    await comanda.save({ session });
    await session.commitTransaction();
    res.json(comanda);
  } catch (err) {
    if (session.inTransaction()) await session.abortTransaction();
    res.status(400).json({ msg: err.message });
  } finally { await session.endSession(); }
});

router.patch('/:id/itens/:itemId', auth, auth.allowRoles('admin', 'operador', 'garcom'), async (req, res) => {
  const session = await mongoose.startSession();
  try {
    session.startTransaction();
    const comanda = await Comanda.findById(req.params.id).session(session);
    const quantidade = Number(req.body.quantidade);
    if (!comanda || comanda.status !== 'aberta') return res.status(400).json({ msg: 'Comanda não está aberta' });
    const item = comanda.itens.id(req.params.itemId);
    if (!item) return res.status(404).json({ msg: 'Item não encontrado' });
    if (!Number.isFinite(quantidade) || quantidade < 0.001) return res.status(400).json({ msg: 'Quantidade inválida' });
    const product = await Product.findById(item.produtoId).session(session);
    if (product && !permiteFracionar(product) && !Number.isInteger(quantidade)) return res.status(400).json({ msg: 'Este produto é vendido por unidade' });
    const porPeso = item.tipoVenda === 'peso';
    const pesoNovo = porPeso ? (req.body.pesoVendidoKg == null ? Number(item.pesoVendidoKg) * quantidade / Number(item.quantidade) : Number(req.body.pesoVendidoKg)) : 0;
    if (porPeso && (!Number.isFinite(pesoNovo) || pesoNovo <= 0)) throw new Error('Informe o peso vendido');
    if (comanda.estoqueBaixado) await ajustarEstoque([item], 'devolver', session);
    item.quantidade = quantidade;
    item.quantidadePecas = porPeso ? 0 : quantidade;
    if (porPeso) {
      item.pesoVendidoKg = pesoNovo;
      item.precoUnitario = money(pesoNovo * Number(product.preco || 0) / quantidade);
    }
    await ajustarEstoque([item], 'baixar', session);
    comanda.estoqueBaixado = true;
    await recalcularPrecosComanda(comanda, session);
    comanda.valorTotal = money(calcularSubtotalComanda(comanda.itens) + Number(comanda.taxaEntrega || 0));
    comanda.saldoDevedor = Math.max(0, comanda.valorTotal - Number(comanda.valorPago || 0));
    await comanda.save({ session });
    await session.commitTransaction();
    res.json(comanda);
  } catch (err) {
    if (session.inTransaction()) await session.abortTransaction();
    res.status(400).json({ msg: err.message });
  } finally { await session.endSession(); }
});

router.delete('/:id/itens/:itemId', auth, auth.allowRoles('admin', 'operador', 'garcom'), async (req, res) => {
  const session = await mongoose.startSession();
  try {
    session.startTransaction();
    const comanda = await Comanda.findById(req.params.id).session(session);
    if (!comanda || comanda.status !== 'aberta') return res.status(400).json({ msg: 'Comanda não está aberta' });
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
    res.status(400).json({ msg: err.message });
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
    res.status(400).json({ msg: err.message });
  } finally { await session.endSession(); }
});

router.patch('/:id/cancelar', auth, auth.allowRoles('admin', 'operador', 'garcom'), async (req, res) => {
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
    await session.commitTransaction();
    res.json(comanda);
  } catch (err) {
    if (session.inTransaction()) await session.abortTransaction();
    res.status(err.status || 400).json({ msg: err.message });
  } finally { await session.endSession(); }
});

router.patch('/:id/receber-parcial', auth, auth.allowRoles('admin', 'operador', 'garcom'), async (req, res) => {
  try {
    const resultado = await executarOperacaoFinanceira({ req, tipo: 'comanda-receber', recursoId: req.params.id, executar: async (session, dataRecebimento) => {
    const comanda = await Comanda.findById(req.params.id).session(session);
    if (!comanda || comanda.status !== 'aberta') throw new Error('Comanda não está aberta');

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
    res.json(resultado);
  } catch (err) {
    res.status(err.status || 400).json({ msg: err.message });
  }
});

router.patch('/:id/cliente', auth, auth.allowRoles('admin', 'operador', 'garcom'), async (req, res) => {
  const session = await mongoose.startSession();
  try {
    session.startTransaction();
    const comanda = await Comanda.findById(req.params.id).session(session);
    const telefone = normalizarTelefoneCliente(req.body.telefone);
    const nome = String(req.body.nome || '').trim();
    if (!comanda || !telefone) throw new Error('Dados do cliente inválidos');

    let customer = comanda.clienteId ? await Customer.findById(comanda.clienteId).session(session) : null;
    customer = customer || await Customer.findOne({ telefone }).session(session);
    if (customer) {
      if (nome) customer.nome = nome;
      else if (comanda.clienteNome && comanda.clienteNome !== 'Cliente não identificado') customer.nome = comanda.clienteNome;
      customer.telefone = telefone;
      await customer.save({ session });
    } else {
      customer = new Customer({ nome: nome || comanda.clienteNome || 'Cliente não identificado', telefone, createdBy: req.user.id });
      await customer.save({ session });
    }

    comanda.clienteId = customer.id;
    if (nome) comanda.clienteNome = nome;
    await comanda.save({ session });
    const order = comanda.pedidoId ? await Order.findByIdAndUpdate(comanda.pedidoId, { clienteId: customer.id, clienteNome: customer.nome, clienteTelefone: telefone }, { new: true, session }) : null;
    await session.commitTransaction();
    res.json({ customer, order });
  } catch (err) {
    if (session.inTransaction()) await session.abortTransaction();
    res.status(400).json({ msg: err.message });
  } finally { await session.endSession(); }
});

router.post('/:id/fechar', auth, auth.allowRoles('admin', 'operador'), async (req, res) => {
  try {
    const resultado = await executarOperacaoFinanceira({ req, tipo: 'comanda-fechar', recursoId: req.params.id, executar: async (session, dataRecebimento) => {
    const comanda = await Comanda.findById(req.params.id).session(session);
    if (!comanda || comanda.status !== 'aberta' || !comanda.itens.length) throw new Error('Comanda sem itens ou já fechada');
    await recalcularPrecosComanda(comanda, session);
    const utilizacaoInterna = Boolean(req.body.utilizacaoInterna);
    const metodoPagamento = normalizarFormaPagamento(req.body.metodoPagamento);
    if (!comanda.estoqueBaixado) {
      await ajustarEstoque(comanda.itens, 'baixar', session);
      comanda.estoqueBaixado = true;
    }
    const subtotal = calcularSubtotalComanda(comanda.itens);
    const discount = money(req.body.desconto || 0);
    if (discount < 0 || discount > subtotal) throw new Error('Desconto inválido');
    const total = utilizacaoInterna ? 0 : money(subtotal + Number(comanda.taxaEntrega || 0) - discount);

    const historico = Array.isArray(comanda.historicoPagamentos) ? comanda.historicoPagamentos : [];
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
    let customer = comanda.clienteId ? await Customer.findById(comanda.clienteId).session(session) : null;
    if (telefone) {
      customer = customer || await Customer.findOne({ telefone }).session(session);
      if (customer) {
        if (nome) customer.nome = nome;
        else if (comanda.clienteNome && comanda.clienteNome !== 'Cliente não identificado') customer.nome = comanda.clienteNome;
        customer.telefone = telefone;
        await customer.save({ session });
      } else {
        customer = new Customer({ nome: nome || comanda.clienteNome || 'Cliente não identificado', telefone, createdBy: req.user.id });
        await customer.save({ session });
      }
    }
    const order = new Order({
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
    if (customer && !utilizacaoInterna) {
      await Customer.findByIdAndUpdate(customer.id, { $inc: { cafesFidelidade: 1 } }, { session });
      comanda.clienteId = customer.id;
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
    return { comanda, pedido: order };
    } });
    res.json(resultado);
  } catch (err) {
    res.status(err.status || 400).json({ msg: err.message });
  }
});

module.exports = router;
module.exports.normalizarTelefoneCliente = normalizarTelefoneCliente;
module.exports.calcularSubtotalComanda = calcularSubtotalComanda;
module.exports.calcularStatusPagamentoComanda = calcularStatusPagamentoComanda;

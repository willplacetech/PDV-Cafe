const express = require('express');
const mongoose = require('mongoose');
const Order = require('../models/Order');
const Comanda = require('../models/Comanda');
const Product = require('../models/Product');
const auth = require('../middleware/auth');
const { obterTaxasCartao, calcularPagamento } = require('../utils/taxasCartao');
const { precoPorUnidade } = require('../utils/pesoProduto');
const { produtoControlaPeso } = require('../utils/estoqueProduto');
const { ajustarEstoque } = require('../utils/movimentarEstoqueVenda');
const { calcularPrecoComDesconto } = require('../utils/descontosQuantidade');
const { calcularStatusPagamento, construirPagamento, normalizarPagamentos, pagamentosDoPedido, validarCancelamentoFinanceiro } = require('../utils/pagamento');

const { executarOperacaoFinanceira } = require('../utils/operacaoFinanceira');

const router = express.Router();
const permiteFracionar = (product) => !Number(product?.pesoPorUnidade) && (Boolean(product?.vendidoFracionado) || ['kg', 'L'].includes(product?.unidadeVenda));
const money = (value) => Math.round((Number(value) + Number.EPSILON) * 100) / 100;

const normalizarStatusFiltro = (status) => {
  if (!status) return undefined;

  if (status === 'abertas' || status === 'pendente,parcial' || status === 'todos') {
    return { $in: ['pendente', 'parcial'] };
  }

  return status;
};

const statusPedidoDe = (statusPagamento) => (statusPagamento === 'quitado' ? 'pago' : statusPagamento);

const aplicarRecebimentoPedido = async ({ order, tipo, valorRecebido, observacao, taxas, session, dataRecebimento, quitar = false }) => {
  if (!['dinheiro', 'pix', 'cartao_credito', 'cartao_debito'].includes(tipo)) throw new Error('Forma de pagamento inválida');

  if (order.comandaId) {
    const comanda = await Comanda.findById(order.comandaId).session(session);
    if (!comanda || comanda.status === 'cancelada' || comanda.utilizacaoInterna) throw new Error('Comanda não aceita recebimentos');
    const situacao = calcularStatusPagamento(comanda);
    const saldo = situacao.saldoDevedor;
    if (saldo <= 0) throw new Error('Pedido já está quitado');
    const valor = quitar ? saldo : money(valorRecebido);
    if (!Number.isFinite(valor) || valor <= 0) throw new Error('Informe um valor válido para receber');
    if (valor > saldo) throw new Error('O recebimento não pode ser maior que o saldo pendente');

    comanda.historicoPagamentos.push(construirPagamento({
      valor,
      formaPagamento: tipo,
      data: dataRecebimento,
      taxas,
      observacao,
    }));
    const atualizada = calcularStatusPagamento(comanda);
    comanda.valorPago = atualizada.valorPago;
    comanda.saldoDevedor = atualizada.saldoDevedor;
    comanda.statusPagamento = atualizada.statusPagamento;
    await comanda.save({ session });

    order.status = statusPedidoDe(atualizada.statusPagamento);
    await order.save({ session });
    return { ...order.toObject(), pagamentos: normalizarPagamentos(comanda.historicoPagamentos) };
  }

  if (!['pendente', 'parcial'].includes(order.status)) throw new Error('Este pedido não aceita novos pagamentos');
  const pagos = normalizarPagamentos(order.pagamentos)
    .filter((pagamento) => pagamento.tipo !== 'credito_loja')
    .reduce((soma, pagamento) => soma + pagamento.valorRecebido, 0);
  const saldo = money(order.total - pagos);
  if (saldo <= 0) throw new Error('Pedido já está quitado');
  const valor = quitar ? saldo : money(valorRecebido);
  if (!Number.isFinite(valor) || valor <= 0) throw new Error('Informe um valor válido para receber');
  if (valor > saldo) throw new Error('O recebimento não pode ser maior que o saldo pendente');
  order.pagamentos.push({ tipo, valorRecebido: valor, ...calcularPagamento(tipo, valor, taxas), dataPagamento: dataRecebimento || new Date(), quitado: valor === saldo, observacao });
  order.status = valor === saldo ? 'pago' : 'parcial';
  await order.save({ session });
  return order.toObject();
};

async function buildOrderItems(rawItems, session) {
  if (!Array.isArray(rawItems) || !rawItems.length) throw new Error('O pedido precisa ter pelo menos um item');
  const totals = new Map();
  for (const item of rawItems) {
    const quantity = Number(item.quantidade);
    if (!mongoose.isValidObjectId(item.produtoId) || !Number.isFinite(quantity) || quantity < 0.001) throw new Error('Item de pedido inválido');
    totals.set(String(item.produtoId), (totals.get(String(item.produtoId)) || 0) + quantity);
  }
  const products = await Product.find({ _id: { $in: [...totals.keys()] } }).session(session);
  const byId = new Map(products.map((product) => [product.id, product]));
  const quantidadesPorProduto = new Map(totals);
  totals.clear();
  const items = rawItems.map((item) => {
    const product = byId.get(String(item.produtoId));
    const vendaPorPeso = produtoControlaPeso(product) && item.tipoVenda === 'peso';
    const pesoVendidoKg = vendaPorPeso ? Number(item.pesoVendidoKg) : 0;
    const quantity = vendaPorPeso ? 1 : Number(item.quantidade);
    if (!product) throw new Error('Produto não encontrado');
    if (vendaPorPeso && (!Number.isFinite(pesoVendidoKg) || pesoVendidoKg <= 0)) throw new Error('Informe o peso vendido');
    if (!permiteFracionar(product) && !Number.isInteger(quantity)) throw new Error(`O produto "${product.nome}" é vendido somente por unidade`);
    const precoNormal = vendaPorPeso ? money(pesoVendidoKg * Number(product.preco || 0)) : precoPorUnidade(product);
    const pricing = vendaPorPeso ? { precoUnitario: precoNormal, precoNormal, economiaTotal: 0, faixaAplicada: null } : calcularPrecoComDesconto(product, quantidadesPorProduto.get(String(product._id)), precoNormal);
    return { produtoId: product.id, codigo: product.codigo, nome: product.nome, precoUnitario: pricing.precoUnitario, precoUnitarioOriginal: pricing.precoNormal, descontoQuantidade: pricing.economiaUnitario, economiaQuantidade: pricing.economiaTotal, faixaDescontoQuantidade: pricing.faixaAplicada?.quantidadeMinima, quantidade: quantity, quantidadePecas: vendaPorPeso ? 0 : quantity, pesoVendidoKg: vendaPorPeso ? pesoVendidoKg : undefined, tipoVenda: vendaPorPeso ? 'peso' : (produtoControlaPeso(product) ? 'inteiro' : 'unidade'), unidadeVenda: product.unidadeVenda, pesoPorUnidade: product.pesoPorUnidade, unidadePeso: product.unidadePeso };
  });
  await ajustarEstoque(items, 'baixar', session);
  return items;
}

router.post('/', auth, auth.allowRoles('admin'), async (req, res) => {
  const idTemporario = String(req.body.idTemporario || '').trim().slice(0, 100);
  if (idTemporario) {
    const existente = await Order.findOne({ idTemporario });
    if (existente) return res.status(200).json(existente);
  }
  const session = await mongoose.startSession();
  try {
    session.startTransaction();
    const items = await buildOrderItems(req.body.itens, session);
    const subtotal = money(items.reduce((sum, item) => sum + item.precoUnitario * item.quantidade, 0));
    const discount = money(req.body.desconto || 0);
    if (discount < 0 || discount > subtotal) throw new Error('Desconto inválido');
    const order = new Order({ idTemporario: idTemporario || undefined, itens: items, subtotal, desconto: discount, total: money(subtotal - discount), clienteId: req.body.clienteId || undefined, clienteNome: req.body.clienteNome || 'Cliente não identificado', clienteTelefone: req.body.clienteTelefone || '', atendente: req.user.username, comandaId: req.body.comandaId || undefined });
    await order.save({ session });
    await session.commitTransaction();
    res.status(201).json(order);
  } catch (err) {
    if (session.inTransaction()) await session.abortTransaction();
    if (err.code === 11000 && idTemporario) {
      const existente = await Order.findOne({ idTemporario });
      if (existente) return res.status(200).json(existente);
    }
    res.status(400).json({ msg: err.message });
  } finally { await session.endSession(); }
});

router.get('/', auth, auth.allowRoles('admin'), async (req, res) => {
  try {
    const { clienteId, status, inicio, fim } = req.query;
    const filter = {};
    if (clienteId) filter.clienteId = clienteId;
    const statusNormalizado = normalizarStatusFiltro(status);
    if (statusNormalizado) filter.status = statusNormalizado;
    if (inicio && fim) filter.createdAt = { $gte: new Date(inicio), $lte: new Date(new Date(fim).setHours(23, 59, 59)) };
    const pedidos = await Order.find(filter).sort({ createdAt: -1 }).lean();
    const comandaIds = [...new Set(pedidos.map((pedido) => pedido.comandaId).filter(Boolean).map(String))];
    const comandas = comandaIds.length
      ? await Comanda.find({ _id: { $in: comandaIds } }).select('_id valorTotal historicoPagamentos').lean()
      : [];
    const comandasPorId = new Map(comandas.map((comanda) => [String(comanda._id), comanda]));
    res.json(pedidos.map((pedido) => {
      const comanda = pedido.comandaId ? comandasPorId.get(String(pedido.comandaId)) : null;
      if (!comanda) return pedido;
      const situacao = calcularStatusPagamento(comanda);
      return {
        ...pedido,
        status: statusPedidoDe(situacao.statusPagamento),
        pagamentos: normalizarPagamentos(comanda.historicoPagamentos),
      };
    }));
  } catch (err) { res.status(500).json({ msg: err.message }); }
});

router.get('/:id', auth, auth.allowRoles('admin'), async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ msg: 'Pedido não encontrado' });
    res.json(order);
  } catch (err) { res.status(400).json({ msg: err.message }); }
});

router.patch('/:id/alterar-comanda', auth, auth.allowRoles('admin'), async (req, res) => {
  const comandaId = req.body.comandaId;
  if (!comandaId) return res.status(400).json({ msg: 'Informe a comanda de destino' });
  if (!mongoose.isValidObjectId(comandaId)) return res.status(400).json({ msg: 'Comanda invalida' });
  const session = await mongoose.startSession();
  try {
    let resultado;
    await session.withTransaction(async () => {
      const conflito = (msg) => { throw Object.assign(new Error(msg), { status: 409 }); };
      const order = await Order.findById(req.params.id).session(session);
      if (!order) throw Object.assign(new Error('Pedido nao encontrado'), { status: 404 });
      if (!['pendente', 'parcial'].includes(order.status)) conflito('Somente pedidos em aberto podem ser transferidos');
      if (String(order.comandaId || '') === String(comandaId)) {
        resultado = order.toObject();
        return;
      }
      const novaComanda = await Comanda.findById(comandaId).session(session);
      if (!novaComanda || novaComanda.status !== 'aberta') conflito('Comanda de destino nao esta aberta');
      if (novaComanda.itens.length || novaComanda.historicoPagamentos.length || novaComanda.valorTotal || novaComanda.taxaEntrega || novaComanda.desconto || novaComanda.pedidoId || novaComanda.estoqueBaixado || novaComanda.utilizacaoInterna || novaComanda.entrega) {
        conflito('A transferencia exige uma comanda de destino vazia, sem pagamentos, pedido ou entrega');
      }
      if (novaComanda.clienteId && String(novaComanda.clienteId) !== String(order.clienteId || '')) conflito('Comanda de destino pertence a outro cliente');
      if (await Order.exists({ comandaId }).session(session)) conflito('Comanda de destino ja possui um pedido vinculado');
      if (order.utilizacaoInterna || ['processando', 'autorizada', 'cancelada'].includes(order.nfce?.status) || order.pagamentos.some(p => ['pendente', 'emitido'].includes(p.fiscal?.status))) {
        conflito('Pedido com utilizacao interna ou documento fiscal vinculado exige transferencia especifica');
      }

      const anterior = order.comandaId ? await Comanda.findById(order.comandaId).session(session) : null;
      if (order.comandaId && (!anterior || anterior.status === 'cancelada' || anterior.utilizacaoInterna || anterior.entrega || String(anterior.pedidoId || '') !== order.id)) {
        conflito('Comanda de origem inconsistente ou vinculada a entrega; transferencia exige revisao');
      }
      if (anterior && (money(anterior.valorTotal) !== money(order.total) || await Order.exists({ comandaId: anterior._id, _id: { $ne: order._id } }).session(session))) {
        conflito('Comanda de origem possui valores ou pedidos incompatíveis com a transferencia integral');
      }
      const historico = anterior ? anterior.historicoPagamentos.map(p => p.toObject()) : order.pagamentos.map(p => ({
        _id: p._id, valor: p.valorRecebido, formaPagamento: p.tipo, taxaPercentual: p.taxaPercentual,
        taxaValor: p.taxaValor, valorLiquido: p.valorLiquido, data: p.dataPagamento,
        observacao: p.observacao, usuario: order.atendente,
      }));
      const situacao = calcularStatusPagamento({ valorTotal: order.total, historicoPagamentos: historico });
      if (situacao.saldoDevedor <= 0) conflito('Pedido ja quitado; atualize antes de transferir');
      const origem = anterior ? { ...anterior.toObject(), comandaId: anterior._id } : { ...order.toObject(), comandaId: null, valorTotal: order.total, historicoPagamentos: historico };
      order.transferenciasComanda.push({ origem, destinoComandaId: novaComanda._id, data: new Date(), usuario: req.user.username });
      novaComanda.itens = anterior ? anterior.itens.map(item => item.toObject()) : order.itens.map(item => item.toObject());
      novaComanda.valorTotal = order.total;
      novaComanda.taxaEntrega = order.taxaEntrega;
      novaComanda.desconto = order.desconto;
      novaComanda.historicoPagamentos = historico;
      novaComanda.estoqueBaixado = anterior ? anterior.estoqueBaixado : true;
      novaComanda.clienteId = order.clienteId;
      novaComanda.clienteNome = order.clienteNome || anterior?.clienteNome || novaComanda.clienteNome;
      novaComanda.tipoAtendimento = order.tipoAtendimento;
      // This order was already created. Closing the destination prevents a second
      // order and another inventory movement through the normal closing route.
      novaComanda.status = 'fechada';
      novaComanda.pedidoId = order._id;
      if (anterior) {
        anterior.pedidoId = undefined;
        anterior.itens = [];
        anterior.valorTotal = 0;
        anterior.taxaEntrega = 0;
        anterior.desconto = 0;
        anterior.historicoPagamentos = [];
        anterior.estoqueBaixado = false;
        anterior.status = 'fechada';
        await anterior.save({ session });
      }
      order.comandaId = novaComanda._id;
      order.pagamentos = [];
      order.status = statusPedidoDe(situacao.statusPagamento);
      await order.save({ session });
      await novaComanda.save({ session });
      resultado = { ...order.toObject(), pagamentos: normalizarPagamentos(historico) };
    });
    res.json(resultado);
  } catch (err) {
    res.status(err.status || 400).json({ msg: err.message });
  } finally { await session.endSession(); }
});

router.patch('/:id/adicionar-itens', auth, auth.allowRoles('admin'), async (req, res) => {
  const session = await mongoose.startSession();
  try {
    session.startTransaction();
    const order = await Order.findById(req.params.id).session(session);
    if (!order || !['pendente', 'parcial'].includes(order.status)) throw new Error('Somente pedidos A Receber podem receber novos itens');
    if (!order.comandaId) throw new Error('Este pedido não está vinculado a uma comanda');
    if (!Array.isArray(req.body.itens) || !req.body.itens.length) throw new Error('Adicione pelo menos um produto');

    const novosItens = await buildOrderItems(req.body.itens, session);

    const subtotalNovos = novosItens.reduce((sum, item) => sum + item.precoUnitario * item.quantidade, 0);
    order.itens.push(...novosItens);
    order.subtotal = money(Number(order.subtotal || 0) + subtotalNovos);
    order.total = money(order.subtotal + Number(order.taxaEntrega || 0) - Number(order.desconto || 0));
    const nome = String(req.body.nomeSolicitante || '').trim();
    const observacao = String(req.body.observacao || '').trim();
    const registro = [nome, observacao].filter(Boolean).join(': ');
    if (registro) order.observacao = [order.observacao, `Novo pedido - ${registro}`].filter(Boolean).join(' | ');
    await order.save({ session });

    const comanda = await Comanda.findById(order.comandaId).session(session);
    if (comanda) {
      comanda.itens.push(...novosItens);
      comanda.valorTotal = order.total;
      comanda.saldoDevedor = Math.max(0, order.total - Number(comanda.valorPago || 0));
      comanda.estoqueBaixado = true;
      if (registro) comanda.observacao = [comanda.observacao, `Novo pedido - ${registro}`].filter(Boolean).join(' | ');
      await comanda.save({ session });
    }
    await session.commitTransaction();
    res.json(order);
  } catch (err) {
    if (session.inTransaction()) await session.abortTransaction();
    res.status(400).json({ msg: err.message });
  } finally { await session.endSession(); }
});

router.patch('/:id/pagar', auth, auth.allowRoles('admin'), async (req, res) => {
  try {
    const resultado = await executarOperacaoFinanceira({ req, tipo: 'pedido-pagar', recursoId: req.params.id, executar: async (session, dataRecebimento) => {
    const order = await Order.findById(req.params.id).session(session);
    if (!order) throw new Error('Pedido não encontrado');
    const tipo = req.body.tipo || 'dinheiro';
    const atualizado = await aplicarRecebimentoPedido({
      order,
      tipo,
      valorRecebido: req.body.valorRecebido,
      observacao: req.body.observacao,
      taxas: await obterTaxasCartao(),
      session,
      dataRecebimento,
    });
    return atualizado;
    } });
    res.json(resultado);
  } catch (err) {
    res.status(err.status || 400).json({ msg: err.message });
  }
});

router.patch('/:id/quitar', auth, auth.allowRoles('admin'), async (req, res) => {
  try {
    const resultado = await executarOperacaoFinanceira({ req, tipo: 'pedido-quitar', recursoId: req.params.id, executar: async (session, dataRecebimento) => {
    const order = await Order.findById(req.params.id).session(session);
    if (!order) throw new Error('Pedido não encontrado');
    const atualizado = await aplicarRecebimentoPedido({
      order,
      tipo: 'dinheiro',
      observacao: 'Quitação total',
      taxas: await obterTaxasCartao(),
      session,
      dataRecebimento,
      quitar: true,
    });
    return atualizado;
    } });
    res.json(resultado);
  } catch (err) {
    res.status(err.status || 400).json({ msg: err.message });
  }
});

router.patch('/cliente/:clienteId/quitar', auth, auth.allowRoles('admin'), async (req, res) => {
  try {
    const resultado = await executarOperacaoFinanceira({ req, tipo: 'cliente-quitar', recursoId: req.params.clienteId, executar: async (session, dataRecebimento) => {
    const pedidos = await Order.find({ clienteId: req.params.clienteId, status: { $in: ['pendente', 'parcial'] } }).session(session);
    if (!pedidos.length) throw new Error('Este cliente não possui pendências');
    const tipo = req.body.tipo || 'dinheiro';
    const taxasCartao = await obterTaxasCartao();
    const atualizados = [];
    for (const order of pedidos) {
      atualizados.push(await aplicarRecebimentoPedido({
        order,
        tipo,
        observacao: req.body.observacao || 'Quitação total do cliente',
        taxas: taxasCartao,
        session,
      dataRecebimento,
        quitar: true,
      }));
    }
    return { pedidos: atualizados };
    } });
    res.json(resultado);
  } catch (err) {
    res.status(err.status || 400).json({ msg: err.message });
  }
});

router.patch('/:id/cancelar', auth, auth.allowRoles('admin'), async (req, res) => {
  const session = await mongoose.startSession();
  try {
    session.startTransaction();
    const order = await Order.findById(req.params.id).session(session);
    if (!order || !['pendente', 'parcial'].includes(order.status)) throw new Error('Somente pedidos pendentes ou parciais podem ser cancelados');
    const comanda = order.comandaId ? await Comanda.findById(order.comandaId).session(session) : null;
    if (order.comandaId && !comanda) {
      const erro = new Error('Cancelamento bloqueado: comanda vinculada ausente. Regularize o historico financeiro antes de cancelar.');
      erro.status = 409;
      throw erro;
    }
    validarCancelamentoFinanceiro(pagamentosDoPedido(order, comanda), [order]);
    if (!comanda || comanda.estoqueBaixado) {
      await ajustarEstoque(order.itens, 'devolver', session, { legadoPedido: !comanda });
    }
    if (comanda && String(comanda.pedidoId || order._id) === String(order._id)) {
      comanda.status = 'cancelada';
      comanda.estoqueBaixado = false;
      await comanda.save({ session });
    }
    order.status = 'cancelado';
    await order.save({ session });
    await session.commitTransaction();
    res.json(order);
  } catch (err) {
    if (session.inTransaction()) await session.abortTransaction();
    res.status(err.status || 400).json({ msg: err.message });
  } finally { await session.endSession(); }
});

module.exports = router;
module.exports.normalizarStatusFiltro = normalizarStatusFiltro;

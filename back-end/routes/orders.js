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
const { calcularStatusPagamento, construirPagamento, normalizarPagamentos } = require('../utils/pagamento');

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

const aplicarRecebimentoPedido = async ({ order, tipo, valorRecebido, observacao, taxas, session, quitar = false }) => {
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
  order.pagamentos.push({ tipo, valorRecebido: valor, ...calcularPagamento(tipo, valor, taxas), dataPagamento: new Date(), quitado: valor === saldo, observacao });
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
  try {
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ msg: 'Pedido não encontrado' });
    if (!['pendente', 'parcial'].includes(order.status)) return res.status(400).json({ msg: 'Somente pedidos em aberto podem ser movidos para outra comanda' });

    const comandaId = req.body.comandaId;
    if (!comandaId) return res.status(400).json({ msg: 'Informe a comanda de destino' });
    if (!mongoose.isValidObjectId(comandaId)) return res.status(400).json({ msg: 'Comanda inválida' });

    const novaComanda = await Comanda.findById(comandaId);
    if (!novaComanda || novaComanda.status !== 'aberta') return res.status(400).json({ msg: 'Comanda de destino não está aberta' });

    if (order.comandaId && String(order.comandaId) !== String(comandaId)) {
      const comandaAnterior = await Comanda.findById(order.comandaId);
      if (comandaAnterior && String(comandaAnterior._id) !== String(comandaId)) {
        comandaAnterior.pedidoId = undefined;
        comandaAnterior.observacao = comandaAnterior.observacao || '';
        await comandaAnterior.save();
      }
    }

    if (order.comandaId && String(order.comandaId) === String(comandaId)) {
      return res.json(order);
    }

    order.comandaId = comandaId;
    novaComanda.pedidoId = order._id;
    await Promise.all([order.save(), novaComanda.save()]);

    res.json(order);
  } catch (err) {
    res.status(400).json({ msg: err.message });
  }
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
  const session = await mongoose.startSession();
  try {
    session.startTransaction();
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
    });
    await session.commitTransaction();
    res.json(atualizado);
  } catch (err) {
    if (session.inTransaction()) await session.abortTransaction();
    res.status(400).json({ msg: err.message });
  } finally { await session.endSession(); }
});

router.patch('/:id/quitar', auth, auth.allowRoles('admin'), async (req, res) => {
  const session = await mongoose.startSession();
  try {
    session.startTransaction();
    const order = await Order.findById(req.params.id).session(session);
    if (!order) throw new Error('Pedido não encontrado');
    const atualizado = await aplicarRecebimentoPedido({
      order,
      tipo: 'dinheiro',
      observacao: 'Quitação total',
      taxas: await obterTaxasCartao(),
      session,
      quitar: true,
    });
    await session.commitTransaction();
    res.json(atualizado);
  } catch (err) {
    if (session.inTransaction()) await session.abortTransaction();
    res.status(400).json({ msg: err.message });
  } finally { await session.endSession(); }
});

router.patch('/cliente/:clienteId/quitar', auth, auth.allowRoles('admin'), async (req, res) => {
  const session = await mongoose.startSession();
  try {
    session.startTransaction();
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
        quitar: true,
      }));
    }
    await session.commitTransaction();
    res.json({ pedidos: atualizados });
  } catch (err) {
    if (session.inTransaction()) await session.abortTransaction();
    res.status(400).json({ msg: err.message });
  } finally { await session.endSession(); }
});

router.patch('/:id/cancelar', auth, auth.allowRoles('admin'), async (req, res) => {
  const session = await mongoose.startSession();
  try {
    session.startTransaction();
    const order = await Order.findById(req.params.id).session(session);
    if (!order || !['pendente', 'parcial'].includes(order.status)) throw new Error('Somente pedidos pendentes ou parciais podem ser cancelados');
    const comanda = order.comandaId ? await Comanda.findById(order.comandaId).session(session) : null;
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
    res.status(400).json({ msg: err.message });
  } finally { await session.endSession(); }
});

module.exports = router;
module.exports.normalizarStatusFiltro = normalizarStatusFiltro;

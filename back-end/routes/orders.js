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
  const session = await mongoose.startSession();
  try {
    session.startTransaction();
    const items = await buildOrderItems(req.body.itens, session);
    const subtotal = money(items.reduce((sum, item) => sum + item.precoUnitario * item.quantidade, 0));
    const discount = money(req.body.desconto || 0);
    if (discount < 0 || discount > subtotal) throw new Error('Desconto inválido');
    const order = new Order({ itens: items, subtotal, desconto: discount, total: money(subtotal - discount), clienteId: req.body.clienteId || undefined, clienteNome: req.body.clienteNome || 'Cliente não identificado', clienteTelefone: req.body.clienteTelefone || '', atendente: req.user.username, comandaId: req.body.comandaId || undefined });
    await order.save({ session });
    await session.commitTransaction();
    res.status(201).json(order);
  } catch (err) {
    if (session.inTransaction()) await session.abortTransaction();
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
    res.json(await Order.find(filter).sort({ createdAt: -1 }));
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
    order.total = money(order.subtotal - Number(order.desconto || 0));
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
    const order = await Order.findById(req.params.id);
    if (!order || !['pendente', 'parcial'].includes(order.status)) return res.status(400).json({ msg: 'Este pedido não aceita novos pagamentos' });
    const paid = order.pagamentos.reduce((sum, payment) => sum + (payment.valorRecebido || 0), 0);
    const balance = money(order.total - paid);
    const value = money(req.body.valorRecebido);
    if (!['dinheiro', 'pix', 'credito_loja', 'cartao_credito', 'cartao_debito'].includes(req.body.tipo || 'dinheiro')) return res.status(400).json({ msg: 'Forma de pagamento inválida' });
    if (value !== balance || balance <= 0) return res.status(400).json({ msg: 'O recebimento deve quitar o saldo total do pedido' });
    const tipo = req.body.tipo || 'dinheiro';
    order.pagamentos.push({ tipo, valorRecebido: balance, ...calcularPagamento(tipo, balance, await obterTaxasCartao()), dataPagamento: new Date(), quitado: true, observacao: req.body.observacao });
    order.status = 'pago';
    await order.save();
    res.json(order);
  } catch (err) { res.status(400).json({ msg: err.message }); }
});

router.patch('/:id/quitar', auth, auth.allowRoles('admin'), async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order || !['pendente', 'parcial'].includes(order.status)) return res.status(400).json({ msg: 'Este pedido não aceita quitação' });
    const paid = order.pagamentos.reduce((sum, payment) => sum + (Number(payment.valorRecebido) || 0), 0);
    const balance = money(order.total - paid);
    if (balance <= 0) return res.status(400).json({ msg: 'Pedido já está quitado' });
    order.pagamentos.push({ tipo: 'dinheiro', valorRecebido: balance, ...calcularPagamento('dinheiro', balance), dataPagamento: new Date(), quitado: true, observacao: 'Quitação total' });
    order.status = 'pago';
    await order.save();
    res.json(order);
  } catch (err) { res.status(400).json({ msg: err.message }); }
});

router.patch('/cliente/:clienteId/quitar', auth, auth.allowRoles('admin'), async (req, res) => {
  const session = await mongoose.startSession();
  try {
    session.startTransaction();
    const pedidos = await Order.find({ clienteId: req.params.clienteId, status: { $in: ['pendente', 'parcial'] } }).session(session);
    if (!pedidos.length) throw new Error('Este cliente não possui pendências');
    const tipo = req.body.tipo || 'dinheiro';
    const tiposAceitos = ['dinheiro', 'pix', 'credito_loja', 'cartao_credito', 'cartao_debito'];
    if (!tiposAceitos.includes(tipo)) throw new Error('Forma de pagamento inválida');
    const taxasCartao = await obterTaxasCartao();
    pedidos.forEach((order) => {
      const pago = order.pagamentos.reduce((sum, payment) => sum + (Number(payment.valorRecebido) || 0), 0);
      const saldo = money(order.total - pago);
      if (saldo <= 0) return;
      order.pagamentos.push({ tipo, valorRecebido: saldo, ...calcularPagamento(tipo, saldo, taxasCartao), dataPagamento: new Date(), quitado: true, observacao: req.body.observacao || 'Quitação total do cliente' });
      order.status = 'pago';
    });
    await Promise.all(pedidos.map((order) => order.save({ session })));
    await session.commitTransaction();
    res.json({ pedidos });
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

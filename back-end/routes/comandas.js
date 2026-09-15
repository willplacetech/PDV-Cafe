const express = require('express');
const mongoose = require('mongoose');
const Comanda = require('../models/Comanda');
const Product = require('../models/Product');
const Order = require('../models/Order');
const Customer = require('../models/Customer');
const auth = require('../middleware/auth');

const router = express.Router();
const money = (value) => Math.round((Number(value) + Number.EPSILON) * 100) / 100;
const permiteFracionar = (product) => Boolean(product?.vendidoFracionado) || ['kg', 'g', 'l', 'ml'].includes(product?.unidadeVenda);

async function ajustarEstoque(itens, operacao, session) {
  const produtos = await Product.find({ _id: { $in: itens.map((item) => item.produtoId) } }).session(session);
  const porId = new Map(produtos.map((produto) => [String(produto._id), produto]));
  const totais = new Map();
  const insumos = new Map();
  itens.forEach((item) => {
    const quantidade = Number(item.quantidade || 0);
    const produto = porId.get(String(item.produtoId));
    const ficha = item.insumosConsumidos?.length ? item.insumosConsumidos : produto?.fichaTecnica;
    if (produto?.aFazer && ficha?.length) {
      ficha.forEach((ingrediente) => {
        const key = String(ingrediente.produtoId);
        insumos.set(key, (insumos.get(key) || 0) + Number(ingrediente.quantidade) * quantidade);
      });
    } else {
      const key = String(item.produtoId);
      totais.set(key, (totais.get(key) || 0) + quantidade);
    }
  });
  for (const [produtoId, quantidade] of totais) {
    if (operacao === 'baixar') {
      const product = await Product.findOneAndUpdate({ _id: produtoId, estoque: { $gte: quantidade } }, { $inc: { estoque: -quantidade } }, { new: true, session });
      if (!product) throw new Error(`Estoque insuficiente para o produto ${produtoId}`);
    } else {
      await Product.findByIdAndUpdate(produtoId, { $inc: { estoque: quantidade } }, { session });
    }
  }
  for (const [produtoId, quantidade] of insumos) {
    if (operacao === 'baixar') {
      const product = await Product.findOneAndUpdate({ _id: produtoId, estoqueInsumos: { $gte: quantidade } }, { $inc: { estoqueInsumos: -quantidade } }, { new: true, session });
      if (!product) throw new Error(`Estoque de insumos insuficiente para o ingrediente ${produtoId}`);
    } else {
      await Product.findByIdAndUpdate(produtoId, { $inc: { estoqueInsumos: quantidade } }, { session });
    }
  }
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

router.post('/', auth, auth.allowRoles('admin', 'operador', 'garcom'), async (req, res) => {
  const session = await mongoose.startSession();
  try {
    session.startTransaction();
    const itens = [];
    for (const item of Array.isArray(req.body.itens) ? req.body.itens : []) {
      const quantidade = Number(item.quantidade);
      const product = await Product.findById(item.produtoId).session(session);
      if (!product || !Number.isFinite(quantidade) || quantidade < 0.001) throw new Error('Item inválido');
      if (!permiteFracionar(product) && !Number.isInteger(quantidade)) throw new Error(`O produto "${product.nome}" é vendido somente por unidade`);
      const modificadores = Array.isArray(item.modificadores)
        ? item.modificadores.filter((value) => typeof value === 'string').slice(0, 10)
        : [];
      itens.push({ produtoId: product.id, codigo: product.codigo, nome: product.nome, precoUnitario: product.preco, quantidade, unidadeVenda: product.unidadeVenda, modificadores, aFazer: Boolean(product.aFazer), insumosConsumidos: (product.fichaTecnica || []).map((ingrediente) => ({ produtoId: ingrediente.produtoId, quantidade: ingrediente.quantidade, unidade: ingrediente.unidade })) });
    }
    await ajustarEstoque(itens, 'baixar', session);
    const [comanda] = await Comanda.create([{ clienteId: req.body.clienteId || undefined, clienteNome: req.body.clienteNome || 'Cliente não identificado', observacao: req.body.observacao, itens, estoqueBaixado: itens.length > 0, atendente: req.user.username }], { session });
    await session.commitTransaction();
    res.status(201).json(comanda);
  } catch (err) {
    if (session.inTransaction()) await session.abortTransaction();
    res.status(400).json({ msg: err.message });
  } finally { await session.endSession(); }
});

router.post('/:id/itens', auth, auth.allowRoles('admin', 'operador', 'garcom'), async (req, res) => {
  const session = await mongoose.startSession();
  try {
    session.startTransaction();
    const comanda = await Comanda.findById(req.params.id).session(session);
    const quantidade = Number(req.body.quantidade);
    const product = await Product.findById(req.body.produtoId).session(session);
    if (!comanda || comanda.status !== 'aberta') return res.status(400).json({ msg: 'Comanda não está aberta' });
    if (!product || !Number.isFinite(quantidade) || quantidade < 0.001) return res.status(400).json({ msg: 'Item inválido' });
    if (!permiteFracionar(product) && !Number.isInteger(quantidade)) return res.status(400).json({ msg: 'Este produto é vendido por unidade' });
    const modificadores = Array.isArray(req.body.modificadores)
      ? req.body.modificadores.filter((item) => typeof item === 'string').slice(0, 10)
      : [];
    await ajustarEstoque([{ produtoId: product.id, quantidade }], 'baixar', session);
    comanda.itens.push({ produtoId: product.id, codigo: product.codigo, nome: product.nome, precoUnitario: product.preco, quantidade, unidadeVenda: product.unidadeVenda, modificadores, aFazer: Boolean(product.aFazer), insumosConsumidos: (product.fichaTecnica || []).map((ingrediente) => ({ produtoId: ingrediente.produtoId, quantidade: ingrediente.quantidade, unidade: ingrediente.unidade })) });
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
    const diferenca = quantidade - Number(item.quantidade || 0);
    if (diferenca > 0) await ajustarEstoque([{ produtoId: item.produtoId, quantidade: diferenca }], 'baixar', session);
    if (diferenca < 0) await ajustarEstoque([{ produtoId: item.produtoId, quantidade: Math.abs(diferenca) }], 'devolver', session);
    item.quantidade = quantidade;
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
    if (comanda.estoqueBaixado) await ajustarEstoque([{ produtoId: item.produtoId, quantidade: item.quantidade }], 'devolver', session);
    comanda.itens.pull(req.params.itemId);
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

    const itensMovidos = itensSelecionados.map((item) => ({
      produtoId: item.produtoId,
      codigo: item.codigo,
      nome: item.nome,
      precoUnitario: item.precoUnitario,
      quantidade: item.quantidade,
      unidadeVenda: item.unidadeVenda,
      modificadores: [...(item.modificadores || [])],
      aFazer: Boolean(item.aFazer),
      insumosConsumidos: (item.insumosConsumidos || []).map((ingrediente) => (ingrediente.toObject ? ingrediente.toObject() : { produtoId: ingrediente.produtoId, quantidade: ingrediente.quantidade, unidade: ingrediente.unidade })),
    }));

    if (comandaOrigem.estoqueBaixado) {
      await ajustarEstoque(itensMovidos, 'devolver', session);
    }

    comandaOrigem.itens = comandaOrigem.itens.filter((item) => !itemIds.includes(String(item._id)));
    comandaOrigem.estoqueBaixado = comandaOrigem.itens.length > 0;
    await comandaOrigem.save({ session });

    const novaComanda = new Comanda({
      clienteId: comandaOrigem.clienteId,
      clienteNome: req.body.clienteNome || comandaOrigem.clienteNome || 'Cliente não identificado',
      observacao: req.body.observacao || comandaOrigem.observacao,
      itens: itensMovidos,
      estoqueBaixado: true,
      atendente: req.user.username,
      status: 'aberta',
    });

    await ajustarEstoque(itensMovidos, 'baixar', session);
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
    if (comanda.estoqueBaixado) await ajustarEstoque(comanda.itens, 'devolver', session);
    comanda.status = 'cancelada';
    await comanda.save({ session });
    await session.commitTransaction();
    res.json(comanda);
  } catch (err) {
    if (session.inTransaction()) await session.abortTransaction();
    res.status(400).json({ msg: err.message });
  } finally { await session.endSession(); }
});

router.patch('/:id/cliente', auth, auth.allowRoles('admin', 'operador', 'garcom'), async (req, res) => {
  const session = await mongoose.startSession();
  try {
    session.startTransaction();
    const comanda = await Comanda.findById(req.params.id).session(session);
    const telefone = String(req.body.telefone || '').replace(/\D/g, '');
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
  const session = await mongoose.startSession();
  try {
    session.startTransaction();
    const comanda = await Comanda.findById(req.params.id).session(session);
    if (!comanda || comanda.status !== 'aberta' || !comanda.itens.length) throw new Error('Comanda sem itens ou já fechada');
    const utilizacaoInterna = Boolean(req.body.utilizacaoInterna);
    const metodoPagamento = req.body.metodoPagamento;
    if (!utilizacaoInterna && !['dinheiro', 'pix', 'cartao_credito', 'cartao_debito', 'credito_loja'].includes(metodoPagamento)) {
      throw new Error('Selecione uma forma de pagamento');
    }
    if (!comanda.estoqueBaixado) await ajustarEstoque(comanda.itens, 'baixar', session);
    const subtotal = money(comanda.itens.reduce((sum, item) => sum + item.precoUnitario * item.quantidade, 0));
    const discount = money(req.body.desconto || 0);
    if (discount < 0 || discount > subtotal) throw new Error('Desconto inválido');
    const total = utilizacaoInterna ? 0 : money(subtotal - discount);
    const pagamentoFinal = utilizacaoInterna ? 'credito_loja' : metodoPagamento;
    const creditoLoja = pagamentoFinal === 'credito_loja';
    const telefone = String(req.body.telefone || '').replace(/\D/g, '');
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
      subtotal,
      desconto: discount,
      utilizacaoInterna,
      total,
      clienteId: customer?.id || comanda.clienteId,
      clienteNome: customer?.nome || comanda.clienteNome,
      clienteTelefone: customer?.telefone || telefone,
      atendente: req.user.username,
      comandaId: comanda.id,
      status: utilizacaoInterna || creditoLoja ? (utilizacaoInterna ? 'pago' : 'pendente') : 'pago',
      pagamentos: utilizacaoInterna
        ? [{ tipo: 'credito_loja', valorRecebido: 0, dataPagamento: new Date(), quitado: true, observacao: 'Utilização interna' }]
        : creditoLoja
          ? []
          : [{ tipo: pagamentoFinal, valorRecebido: total, dataPagamento: new Date(), quitado: true }],
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
    comanda.utilizacaoInterna = utilizacaoInterna;
    await comanda.save({ session });
    await session.commitTransaction();
    res.json({ comanda, pedido: order });
  } catch (err) {
    if (session.inTransaction()) await session.abortTransaction();
    res.status(400).json({ msg: err.message });
  } finally { await session.endSession(); }
});

module.exports = router;

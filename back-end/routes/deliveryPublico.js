const express = require('express');
const crypto = require('node:crypto');
const Product = require('../models/Product');
const Tenant = require('../models/Tenant');
const PedidoEntrega = require('../models/PedidoEntrega');
const rateLimit = require('express-rate-limit');

const router = express.Router();
const limitarPedidosPublicos = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { msg: 'Muitas solicitações de delivery. Tente novamente mais tarde.' },
});
const normalizarTelefone = value => String(value || '').replace(/\D/g, '');
const texto = (value, max) => String(value || '').trim().slice(0, max);
const obterTenant = () => Tenant.findOne({ ativo: true, pdvIntegrado: true }).sort({ createdAt: 1 });

router.get('/catalogo', async (req, res, next) => {
  try {
    const produtos = await Product.find({ tipo: 'venda', ativo: true })
      .select('codigo nome categoria preco unidade unidadeVenda vendidoFracionado')
      .sort({ categoria: 1, nome: 1 }).lean();
    return res.json({ produtos });
  } catch (error) { return next(error); }
});

router.post('/pedidos', limitarPedidosPublicos, async (req, res, next) => {
  const nomeCliente = texto(req.body?.nomeCliente, 160);
  const telefone = normalizarTelefone(req.body?.telefone);
  const entrada = req.body?.endereco || {};
  const endereco = { rua: texto(entrada.rua, 200), numero: texto(entrada.numero, 30), complemento: texto(entrada.complemento, 200), bairro: texto(entrada.bairro, 120), referencia: texto(entrada.referencia, 300) };
  const entradaItens = Array.isArray(req.body?.itens) ? req.body.itens : [];
  if (nomeCliente.length < 2 || telefone.length < 8 || telefone.length > 30) return res.status(400).json({ msg: 'Nome e telefone são obrigatórios.' });
  if (!endereco.rua || !endereco.numero || !endereco.bairro) return res.status(400).json({ msg: 'Informe rua, número e bairro.' });
  if (!entradaItens.length || entradaItens.length > 100) return res.status(400).json({ msg: 'Adicione pelo menos um produto.' });
  try {
    const tenant = await obterTenant();
    if (!tenant) return res.status(503).json({ msg: 'Delivery indisponível no momento.' });
    const codigos = [...new Set(entradaItens.map(item => texto(item.codigo, 80)).filter(Boolean))];
    const produtos = await Product.find({ tipo: 'venda', ativo: true, codigo: { $in: codigos } }).select('codigo nome preco').lean();
    const porCodigo = new Map(produtos.map(produto => [produto.codigo, produto]));
    const itens = entradaItens.map(item => { const produto = porCodigo.get(texto(item.codigo, 80)); const quantidade = Number(item.quantidade); if (!produto || !Number.isFinite(quantidade) || quantidade <= 0 || quantidade > 1000) return null; return { descricao: produto.nome, quantidade, precoUnitario: produto.preco }; });
    if (itens.some(item => !item)) return res.status(400).json({ msg: 'Um ou mais produtos não estão disponíveis.' });
    const subtotal = itens.reduce((total, item) => total + item.quantidade * item.precoUnitario, 0);
    const taxaEntrega = Number.isFinite(Number(tenant.taxaEntregaPadrao)) ? Number(tenant.taxaEntregaPadrao) : Number(tenant.taxaPorEntrega) || 0;
    const valorTotal = Number((subtotal + taxaEntrega).toFixed(2));
    const referenciaIntegracao = texto(req.get('Idempotency-Key') || req.body?.idempotencyKey, 128) || crypto.randomUUID();
    const existente = await PedidoEntrega.findOne({ tenantId: tenant._id, referenciaIntegracao }).lean();
    if (existente) return res.status(200).json({ pedido: existente, rastreio: `/pedido/${existente.tokenRastreamento}` });
    const pedido = await PedidoEntrega.create({ tenantId: tenant._id, fonte: 'formulario', origem: { nomeCliente, telefone, endereco }, itens, valorTotal, taxaEntrega, referenciaIntegracao });
    return res.status(201).json({ pedido, rastreio: `/pedido/${pedido.tokenRastreamento}` });
  } catch (error) { return next(error); }
});

module.exports = router;

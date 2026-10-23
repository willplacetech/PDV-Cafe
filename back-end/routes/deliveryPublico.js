const express = require('express');
const crypto = require('node:crypto');
const Product = require('../models/Product');
const Tenant = require('../models/Tenant');
const PedidoEntrega = require('../models/PedidoEntrega');

const router = express.Router();
const normalizarTelefone = value => String(value || '').replace(/\D/g, '');
const texto = (value, max) => String(value || '').trim().slice(0, max);

const obterTenant = () => Tenant.findOne({ ativo: true, pdvIntegrado: true }).sort({ createdAt: 1 });

router.get('/catalogo', async (req, res, next) => {
  try {
    const produtos = await Product.find({ tipo: 'venda', ativo: true })
      .select('codigo nome categoria preco unidade unidadeVenda vendidoFracionado')
      .sort({ categoria: 1, nome: 1 })
      .lean();
    return res.json({ produtos });
  } catch (error) { return next(error); }
});

router.post('/pedidos', async (req, res, next) => {
  const nomeCliente = texto(req.body?.nomeCliente, 160);
  const telefone = normalizarTelefone(req.body?.telefone);
  const enderecoInput = req.body?.endereco || {};
  const endereco = {
    rua: texto(enderecoInput.rua, 200), numero: texto(enderecoInput.numero, 30),
    complemento: texto(enderecoInput.complemento, 200), bairro: texto(enderecoInput.bairro, 120),
    referencia: texto(enderecoInput.referencia, 300),
  };
  const itensInput = Array.isArray(req.body?.itens) ? req.body.itens : [];
  if (nomeCliente.length < 2 || telefone.length < 8 || telefone.length > 30) return res.status(400).json({ msg: 'Nome e telefone são obrigatórios.' });
  if (!endereco.rua || !endereco.numero || !endereco.bairro) return res.status(400).json({ msg: 'Informe rua, número e bairro.' });
  if (!itensInput.length || itensInput.length > 100) return res.status(400).json({ msg: 'Adicione pelo menos um produto.' });
  try {
    const tenant = await obterTenant();
    if (!tenant) return res.status(503).json({ msg: 'Delivery indisponível no momento.' });
    const codigos = [...new Set(itensInput.map(item => texto(item.codigo, 80)).filter(Boolean))];
    const produtos = await Product.find({ tenantId: tenant._id, tipo: 'venda', ativo: true, codigo: { $in: codigos } }).select('codigo nome preco').lean();
    const porCodigo = new Map(produtos.map(produto => [produto.codigo, produto]));
    const itens = itensInput.map(item => {
      const produto = porCodigo.get(texto(item.codigo, 80));
      const quantidade = Number(item.quantidade);
      if (!produto || !Number.isFinite(quantidade) || quantidade <= 0 || quantidade > 1000) return null;
      return { descricao: produto.nome, quantidade, precoUnitario: produto.preco };
    });
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

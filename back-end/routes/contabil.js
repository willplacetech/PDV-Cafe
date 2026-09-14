const express = require('express');
const auth = require('../middleware/auth');
const Order = require('../models/Order');
const Product = require('../models/Product');
const { quantidadeNaUnidadeBase } = require('../utils/quantidade');
const Recipe = require('../models/Recipe');
const Despesa = require('../models/Despesa');

const router = express.Router();
const TIME_ZONE = 'America/Sao_Paulo';

const dataHojeSaoPaulo = () => new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE }).format(new Date());
const chaveDataSaoPaulo = (value) => new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE }).format(new Date(value));

const getMesRange = (mes) => {
  if (mes) {
    const [ano, mesNumero] = String(mes).split('-').map(Number);
    if (ano && mesNumero) {
      const inicio = new Date(`${mes}-01T00:00:00-03:00`);
      const fimMes = new Date(Date.UTC(ano, mesNumero, 1, 3));
      const fimHoje = new Date(`${dataHojeSaoPaulo()}T00:00:00-03:00`);
      fimHoje.setUTCDate(fimHoje.getUTCDate() + 1);
      const fim = inicio.getTime() <= fimHoje.getTime() && fimHoje.getTime() < fimMes.getTime() ? fimHoje : fimMes;
      return { inicio, fim };
    }
  }
  const agora = new Date();
  const mesAtual = `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, '0')}`;
  return getMesRange(mesAtual);
};

const resumoComparativo = async (mes) => {
  const { inicio, fim } = getMesRange(mes);
  const [pedidos, despesas, pedidosComPagamentos] = await Promise.all([
    Order.find({ createdAt: { $gte: inicio, $lt: fim }, status: { $in: ['pago', 'parcial'] } }).select('total').lean(),
    Despesa.find({ status: 'pago', dataPagamento: { $gte: inicio, $lt: fim } }).select('valor').lean(),
    Order.find({ 'pagamentos.dataPagamento': { $gte: inicio, $lt: fim } }).select('pagamentos').lean(),
  ]);
  const receita = pedidos.reduce((total, pedido) => total + Number(pedido.total || 0), 0);
  const despesasPagas = despesas.reduce((total, despesa) => total + Number(despesa.valor || 0), 0);
  const entradas = pedidosComPagamentos.reduce((total, pedido) => total + (pedido.pagamentos || []).filter((pagamento) => {
    const data = new Date(pagamento.dataPagamento);
    return data >= inicio && data < fim;
  }).reduce((subtotal, pagamento) => subtotal + Number(pagamento.valorRecebido || 0), 0), 0);
  return {
    mes,
    pedidos: pedidos.length,
    receita,
    entradas,
    despesasPagas,
    saldo: entradas - despesasPagas,
    resultadoOperacional: receita - despesasPagas,
  };
};

router.use(auth);
router.use(auth.allowRoles('admin'));

router.get('/dre', async (req, res) => {
  try {
    const { inicio, fim } = getMesRange(req.query.mes || req.query.data || null);
    const periodoVendas = await Order.find({
      createdAt: { $gte: inicio, $lt: fim },
      status: { $in: ['pago', 'parcial'] },
    }).lean();

    let receitaBruta = 0;
    let cmv = 0;
    const produtosSemCusto = new Set();
    const itensSemCusto = [];

    for (const pedido of periodoVendas) {
      receitaBruta += Number(pedido.total || 0);
      for (const item of pedido.itens || []) {
        const produtoId = String(item.produtoId || '');
        const quantidade = quantidadeNaUnidadeBase(item);
        const recipe = produtoId ? await Recipe.findOne({ produtoId, ativa: true }).lean() : null;
        const produto = produtoId ? await Product.findById(produtoId).lean() : null;
        const custoUnitario = recipe?.custoUnitario || produto?.custoUnitario || produto?.custo || 0;
        if (custoUnitario > 0) {
          cmv += quantidade * custoUnitario;
        } else {
          produtosSemCusto.add(produto?.nome || item.nome || 'Produto sem cadastro');
          itensSemCusto.push({ produto: produto?.nome || item.nome || 'Produto sem cadastro', quantidade, precoUnitario: Number(item.precoUnitario || 0) });
        }
      }
    }

    const despesasPagas = await Despesa.find({
      status: 'pago',
      dataPagamento: { $gte: inicio, $lt: fim },
    }).lean();

    const despesasPorCategoria = {};
    let despesasOperacionais = 0;
    for (const despesa of despesasPagas) {
      despesasOperacionais += Number(despesa.valor || 0);
      despesasPorCategoria[despesa.categoria] = (despesasPorCategoria[despesa.categoria] || 0) + Number(despesa.valor || 0);
    }

    const depreciacao = Number(req.query.depreciacao || 0);
    const impostos = Number(req.query.impostos || 0);
    const lucroBruto = receitaBruta - cmv;
    const ebit = lucroBruto - despesasOperacionais;
    const ebitda = ebit + depreciacao;
    const lucroLiquido = ebit - impostos;

    res.json({
      periodo: { mes: req.query.mes || `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`, inicio, fim },
      receitaBruta,
      cmv,
      lucroBruto,
      despesasOperacionais,
      despesasPorCategoria,
      ebit,
      depreciacaoAmortizacao: depreciacao,
      ebitda,
      impostosEstimados: impostos,
      lucroLiquido,
      margemBruta: receitaBruta > 0 ? (lucroBruto / receitaBruta) * 100 : 0,
      margemLiquida: receitaBruta > 0 ? (lucroLiquido / receitaBruta) * 100 : 0,
      produtosSemCusto: [...produtosSemCusto],
      itensSemCusto,
    });
  } catch (error) {
    res.status(500).json({ msg: error.message });
  }
});

router.get('/fluxo-caixa', async (req, res) => {
  try {
    const mes = req.query.mes || `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;
    const [ano, mesNumero] = mes.split('-').map(Number);
    const { inicio, fim } = getMesRange(mes);

    const [vendas, despesas] = await Promise.all([
      Order.find({ 'pagamentos.dataPagamento': { $gte: inicio, $lt: fim } }).lean(),
      Despesa.find({ status: 'pago', dataPagamento: { $gte: inicio, $lt: fim } }).lean(),
    ]);

    const entradasPorDia = new Map();
    const saidasPorDia = new Map();

    for (const pedido of vendas) {
      for (const pagamento of pedido.pagamentos || []) {
        if (!pagamento.dataPagamento) continue;
        const data = new Date(pagamento.dataPagamento);
        if (data < inicio || data >= fim) continue;
        const chave = chaveDataSaoPaulo(data);
        entradasPorDia.set(chave, (entradasPorDia.get(chave) || 0) + Number(pagamento.valorRecebido || 0));
      }
    }

    for (const despesa of despesas) {
      const data = new Date(despesa.dataPagamento);
      if (data < inicio || data >= fim) continue;
      const chave = data.toISOString().slice(0, 10);
      saidasPorDia.set(chave, (saidasPorDia.get(chave) || 0) + Number(despesa.valor || 0));
    }

    const lista = [];
    const cursor = new Date(inicio);
    while (cursor < fim) {
      const chave = chaveDataSaoPaulo(cursor);
      const entradas = entradasPorDia.get(chave) || 0;
      const saidas = saidasPorDia.get(chave) || 0;
      lista.push({
        data: chave,
        entradas,
        saidas,
        saldo: entradas - saidas,
      });
      cursor.setDate(cursor.getDate() + 1);
    }

    let saldoAcumulado = 0;
    const fluxo = lista.map((item) => {
      saldoAcumulado += item.saldo;
      return { ...item, saldoAcumulado };
    });

    const totalEntradas = fluxo.reduce((soma, dia) => soma + dia.entradas, 0);
    const totalSaidas = fluxo.reduce((soma, dia) => soma + dia.saidas, 0);

    res.json({
      mes,
      totalEntradas,
      totalSaidas,
      saldoDoMes: totalEntradas - totalSaidas,
      dados: fluxo,
    });
  } catch (error) {
    res.status(500).json({ msg: error.message });
  }
});

router.get('/comparar-meses', async (req, res) => {
  try {
    const agora = new Date();
    const mesAtual = `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, '0')}`;
    const mesA = /^\d{4}-\d{2}$/.test(String(req.query.mesA || '')) ? req.query.mesA : mesAtual;
    const anterior = new Date(`${mesA}-01T00:00:00-03:00`);
    anterior.setUTCMonth(anterior.getUTCMonth() - 1);
    const mesAnterior = `${anterior.getUTCFullYear()}-${String(anterior.getUTCMonth() + 1).padStart(2, '0')}`;
    const mesB = /^\d{4}-\d{2}$/.test(String(req.query.mesB || '')) ? req.query.mesB : mesAnterior;
    const [periodoA, periodoB] = await Promise.all([resumoComparativo(mesA), resumoComparativo(mesB)]);
    res.json({ periodoA, periodoB });
  } catch (error) {
    res.status(500).json({ msg: error.message });
  }
});

module.exports = router;

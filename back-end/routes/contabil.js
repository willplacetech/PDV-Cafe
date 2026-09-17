const express = require('express');
const auth = require('../middleware/auth');
const Order = require('../models/Order');
const Product = require('../models/Product');
const { quantidadeNaUnidadeBase } = require('../utils/quantidade');
const Recipe = require('../models/Recipe');
const Despesa = require('../models/Despesa');
const PaymentSettings = require('../models/PaymentSettings');
const Purchase = require('../models/Purchase');

const router = express.Router();
const TIME_ZONE = 'America/Sao_Paulo';

const dataHojeSaoPaulo = () => new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE }).format(new Date());
const chaveDataSaoPaulo = (value) => new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE }).format(new Date(value));
const dinheiro = (value) => Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
const pagamentoTaxa = (pagamento) => {
  const valor = Number(pagamento.valorRecebido || 0);
  const taxa = Number(pagamento.taxaValor || (valor * Number(pagamento.taxaPercentual || 0) / 100));
  return { taxa: dinheiro(taxa), liquido: dinheiro(valor - taxa) };
};

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
  }).reduce((subtotal, pagamento) => subtotal + pagamentoTaxa(pagamento).liquido, 0), 0);
  const taxasCartao = pedidosComPagamentos.reduce((total, pedido) => total + (pedido.pagamentos || []).filter((pagamento) => {
    const data = new Date(pagamento.dataPagamento);
    return data >= inicio && data < fim;
  }).reduce((subtotal, pagamento) => subtotal + pagamentoTaxa(pagamento).taxa, 0), 0);
  return {
    mes,
    pedidos: pedidos.length,
    receita,
    entradas,
    taxasCartao,
    despesasPagas,
    saldo: entradas - despesasPagas,
    resultadoOperacional: receita - taxasCartao - despesasPagas,
  };
};

router.use(auth);
router.use(auth.allowRoles('admin'));

router.patch('/taxas-cartao', async (req, res) => {
  try {
    const mes = /^\d{4}-\d{2}$/.test(String(req.body.mes || '')) ? req.body.mes : null;
    const tipo = ['cartao_credito', 'cartao_debito'].includes(req.body.tipo) ? req.body.tipo : null;
    const percentual = Number(req.body.taxaPercentual);
    if (!mes || !tipo || !Number.isFinite(percentual) || percentual < 0) return res.status(400).json({ msg: 'Informe mês, cartão e uma taxa válida' });
    await PaymentSettings.findOneAndUpdate(
      { chave: 'principal' },
      { $set: { [tipo]: percentual } },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
    const { inicio, fim } = getMesRange(mes);
    const pedidos = await Order.find({ pagamentos: { $elemMatch: { tipo, dataPagamento: { $gte: inicio, $lt: fim } } } });
    let atualizados = 0;
    for (const pedido of pedidos) {
      let alterado = false;
      pedido.pagamentos.forEach((pagamento) => {
        const data = new Date(pagamento.dataPagamento);
        if (pagamento.tipo !== tipo || data < inicio || data >= fim) return;
        const valor = dinheiro(pagamento.valorRecebido);
        pagamento.taxaPercentual = percentual;
        pagamento.taxaValor = dinheiro(valor * percentual / 100);
        pagamento.valorLiquido = dinheiro(valor - pagamento.taxaValor);
        alterado = true;
        atualizados += 1;
      });
      if (alterado) await pedido.save();
    }
    res.json({ mes, tipo, taxaPercentual: percentual, pagamentosAtualizados: atualizados });
  } catch (error) {
    res.status(500).json({ msg: error.message });
  }
});

router.get('/dre', async (req, res) => {
  try {
    const { inicio, fim } = getMesRange(req.query.mes || req.query.data || null);
    const [periodoVendas, comprasPeriodo] = await Promise.all([
      Order.find({ createdAt: { $gte: inicio, $lt: fim }, status: { $in: ['pago', 'parcial'] } }).lean(),
      Purchase.find({ data: { $gte: inicio, $lt: fim } }).select('valorTotal').lean(),
    ]);

    let receitaBruta = 0;
    let cmv = 0;
    const produtosSemCusto = new Set();
    const itensSemCusto = [];

    for (const pedido of periodoVendas) {
      receitaBruta += Number(pedido.total || 0);
      for (const item of pedido.itens || []) {
        const produtoId = String(item.produtoId || '');
        const quantidade = quantidadeNaUnidadeBase(item);
        const produto = produtoId ? await Product.findById(produtoId).lean() : null;
        const custoUnitario = Number(produto?.custoUnitario || produto?.custoUnitarioBase || 0);
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
      const valor = dinheiro(despesa.valor);
      despesasOperacionais = dinheiro(despesasOperacionais + valor);
      despesasPorCategoria[despesa.categoria] = dinheiro((despesasPorCategoria[despesa.categoria] || 0) + valor);
    }

    const taxasCartao = periodoVendas.reduce((total, pedido) => total + (pedido.pagamentos || []).reduce((subtotal, pagamento) => subtotal + pagamentoTaxa(pagamento).taxa, 0), 0);

    const depreciacao = Number(req.query.depreciacao || 0);
    const impostos = Number(req.query.impostos || 0);
    const deducoes = dinheiro(taxasCartao + impostos);
    const receitaLiquida = dinheiro(receitaBruta - deducoes);
    const lucroBruto = receitaLiquida - cmv;
    const ebitda = dinheiro(lucroBruto - despesasOperacionais);
    const ebit = dinheiro(ebitda - depreciacao);
    const despesasFinanceiras = 0;
    const lucroLiquido = dinheiro(ebit - despesasFinanceiras);
    const compras = dinheiro(comprasPeriodo.reduce((total, compra) => total + Number(compra.valorTotal || 0), 0));

    res.json({
      periodo: { mes: req.query.mes || `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`, inicio, fim },
      receitaBruta,
      receitaLiquida,
      deducoes,
      taxasCartao,
      cmv,
      cmvFormula: 'Estoque inicial + Compras - Estoque final',
      cmvComponentes: { estoqueInicial: null, compras, estoqueFinal: null, metodoAtual: 'custo dos itens vendidos' },
      lucroBruto,
      despesasOperacionais,
      despesasPorCategoria,
      ebit,
      depreciacaoAmortizacao: depreciacao,
      ebitda,
      despesasFinanceiras,
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
        entradasPorDia.set(chave, (entradasPorDia.get(chave) || 0) + pagamentoTaxa(pagamento).liquido);
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

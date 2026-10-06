const express = require('express');
const mongoose = require('mongoose');
const auth = require('../middleware/auth');
const Order = require('../models/Order');
const Comanda = require('../models/Comanda');
const Product = require('../models/Product');
const { quantidadeNaUnidadeBase } = require('../utils/quantidade');
const Despesa = require('../models/Despesa');
const PaymentSettings = require('../models/PaymentSettings');
const Purchase = require('../models/Purchase');
const { calcularCustoUnitarioVenda } = require('../utils/estoqueInsumo');
const { carregarPagamentosDoPeriodo, dinheiro: dinheiroPagamento } = require('../utils/pagamento');

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
  const [pedidos, despesas, pagamentos] = await Promise.all([
    Order.find({ createdAt: { $gte: inicio, $lt: fim }, status: { $in: ['pago', 'parcial'] } }).select('total').lean(),
    Despesa.find({ status: 'pago', dataPagamento: { $gte: inicio, $lt: fim } }).select('valor').lean(),
    carregarPagamentosDoPeriodo({ inicio, fim }),
  ]);
  const receita = pedidos.reduce((total, pedido) => total + Number(pedido.total || 0), 0);
  const despesasPagas = despesas.reduce((total, despesa) => total + Number(despesa.valor || 0), 0);
  const entradas = dinheiroPagamento(pagamentos.reduce((total, pagamento) => total + pagamentoTaxa(pagamento).liquido, 0));
  const taxasCartao = dinheiroPagamento(pagamentos.reduce((total, pagamento) => total + pagamentoTaxa(pagamento).taxa, 0));
  return {
    mes,
    pedidos: pedidos.length,
    receita,
    entradas,
    taxasCartao,
    despesasPagas,
    saldo: dinheiroPagamento(entradas - despesasPagas),
    resultadoOperacional: dinheiroPagamento(receita - taxasCartao - despesasPagas),
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

    // Pagamentos de comandas vivem em Comanda.historicoPagamentos (fonte única),
    // logo a reprocessagem de taxas precisa alcançar esses lançamentos também.
    const comandas = await Comanda.find({
      historicoPagamentos: { $elemMatch: { formaPagamento: tipo, data: { $gte: inicio, $lt: fim } } },
    });
    for (const comanda of comandas) {
      let alterado = false;
      comanda.historicoPagamentos.forEach((pagamento) => {
        const data = new Date(pagamento.data);
        if (pagamento.formaPagamento !== tipo || data < inicio || data >= fim) return;
        const valor = dinheiro(pagamento.valor ?? pagamento.valorRecebido);
        pagamento.taxaPercentual = percentual;
        pagamento.taxaValor = dinheiro(valor * percentual / 100);
        pagamento.valorLiquido = dinheiro(valor - pagamento.taxaValor);
        alterado = true;
        atualizados += 1;
      });
      if (alterado) await comanda.save();
    }
    res.json({ mes, tipo, taxaPercentual: percentual, pagamentosAtualizados: atualizados });
  } catch (error) {
    res.status(500).json({ msg: error.message });
  }
});

router.get('/dre', async (req, res) => {
  try {
    const { inicio, fim } = getMesRange(req.query.mes || req.query.data || null);
    const [periodoVendas, comprasPeriodo, pagamentosPeriodo] = await Promise.all([
      Order.find({ createdAt: { $gte: inicio, $lt: fim }, status: { $in: ['pago', 'parcial'] } })
        .select('total itens pagamentos')
        .lean(),
      Purchase.find({ data: { $gte: inicio, $lt: fim } }).select('valorTotal').lean(),
      carregarPagamentosDoPeriodo({ inicio, fim }),
    ]);

    const produtoIds = [...new Set(periodoVendas.flatMap((pedido) => (pedido.itens || []).map((item) => String(item.produtoId || ''))))]
      .filter((produtoId) => mongoose.isValidObjectId(produtoId));
    const produtos = await Product.find({ _id: { $in: produtoIds } })
      .select('nome tipoProduto custoUnitario custoUnitarioBase precoCompra unidade unidadeCompra unidadeVenda rendimento rendimentoPorUnidadeCompra')
      .lean();
    const produtoPorId = new Map(produtos.map((produto) => [String(produto._id), produto]));

    let receitaBruta = 0;
    let cmv = 0;
    const produtosSemCusto = new Set();
    const itensSemCusto = [];

    for (const pedido of periodoVendas) {
      receitaBruta += Number(pedido.total || 0);
      for (const item of pedido.itens || []) {
        const produtoId = String(item.produtoId || '');
        const quantidade = quantidadeNaUnidadeBase(item);
        const produto = produtoPorId.get(produtoId);
        // Vendas novas preservam o custo na data da venda. Legados mantem
        // o calculo anterior porque nao ha informacao historica para reconstruir.
        const custoHistorico = item.custoUnitarioHistorico;
        const temCustoHistorico = custoHistorico !== undefined && custoHistorico !== null
          && Number.isFinite(Number(custoHistorico)) && Number(custoHistorico) >= 0;
        const custoUnitario = temCustoHistorico
          ? Number(custoHistorico)
          : ['coz', 'producao'].includes(produto?.tipoProduto)
            ? Number(produto?.custoUnitario || produto?.custoUnitarioBase || 0)
            : calcularCustoUnitarioVenda(produto);
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

    const taxasCartao = dinheiro(pagamentosPeriodo.reduce((total, pagamento) => total + pagamentoTaxa(pagamento).taxa, 0));

    const depreciacao = Number(req.query.depreciacao || 0);
    const impostos = Number(req.query.impostos || 0);
    const deducoes = dinheiro(taxasCartao + impostos);
    const receitaLiquida = dinheiro(receitaBruta - deducoes);
    const lucroBruto = dinheiro(receitaLiquida - cmv);
    const ebit = dinheiro(lucroBruto - despesasOperacionais);
    const ebitda = dinheiro(ebit + depreciacao);
    const despesasFinanceiras = 0;
    // O parametro impostos ja integra deducoes e receitaLiquida.
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

    const [despesas, pagamentos] = await Promise.all([
      Despesa.find({ status: 'pago', dataPagamento: { $gte: inicio, $lt: fim } }).lean(),
      carregarPagamentosDoPeriodo({ inicio, fim }),
    ]);

    const entradasPorDia = new Map();
    const saidasPorDia = new Map();

    for (const pagamento of pagamentos) {
      if (!pagamento.dataPagamento) continue;
      const data = new Date(pagamento.dataPagamento);
      if (data < inicio || data >= fim) continue;
      const chave = chaveDataSaoPaulo(data);
      entradasPorDia.set(chave, (entradasPorDia.get(chave) || 0) + pagamentoTaxa(pagamento).liquido);
    }

    for (const despesa of despesas) {
      const data = new Date(despesa.dataPagamento);
      if (data < inicio || data >= fim) continue;
      const chave = chaveDataSaoPaulo(data);
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

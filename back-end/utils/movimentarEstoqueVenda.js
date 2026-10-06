const Product = require('../models/Product');
const StockMovement = require('../models/StockMovement');
const { normalizarEstoqueLegado, produtoControlaPeso, dadosMovimentoEstoque } = require('./estoqueProduto');
const { consumirInsumo, reporInsumo, custoPorBase, paraBase } = require('./estoqueInsumo');
const isCoz = (produto) => (produto.tipoProduto || (produto.aFazer ? 'coz' : 'revenda')) === 'coz';

// Snapshots describe actual consumption, independent of later recipe changes.
async function ajustarEstoque(itens, operacao, session, { legadoPedido = false } = {}) {
  const ids = itens.map(item => item.produtoId);
  const vendas = await Product.find({ _id: { $in: ids } }).session(session);
  const ingredientesIds = [
    ...vendas.filter(isCoz).flatMap(p => (p.fichaTecnica || []).map(i => i.produtoId)),
    ...itens.flatMap(item => (item.insumosConsumidos || []).map(i => i.produtoId)),
  ];
  const produtos = ingredientesIds.length ? await Product.find({ _id: { $in: [...ids, ...ingredientesIds] } }).session(session) : vendas;
  const porId = new Map(produtos.map(p => [String(p._id), p]));
  const totais = new Map();
  const insumos = [];
  const baixar = operacao === 'baixar';
  for (const item of itens) {
    const produto = porId.get(String(item.produtoId));
    if (!produto) throw new Error('Produto não encontrado para movimentação de estoque');
    normalizarEstoqueLegado(produto);
    const qtd = Number(item.quantidade);
    if (!Number.isFinite(qtd) || qtd <= 0) throw new Error('Quantidade inválida');
    const ficha = baixar ? produto.fichaTecnica : (item.insumosConsumidos?.length ? item.insumosConsumidos : produto.fichaTecnica);
    const controlePersistido = item.controleEstoque || null;
    const controle = baixar
      ? (isCoz(produto) && ficha?.length ? (produto.permitirVendaSemInsumo ? 'nenhum' : 'insumos') : 'produto')
      : (controlePersistido || (!legadoPedido && isCoz(produto) && ficha?.length ? (produto.permitirVendaSemInsumo ? 'nenhum' : 'insumos') : 'produto'));
    if (baixar) {
      item.controleEstoque = controle;
      item.insumosConsumidos = controle === 'insumos' ? ficha.map(i => ({ produtoId: i.produtoId, quantidade: i.quantidade, unidade: i.unidade })) : [];
    } else {
      item.controleEstoque = controle;
      if (controle === 'insumos') item.insumosConsumidos = ficha.map(i => ({ produtoId: i.produtoId, quantidade: i.quantidade, unidade: i.unidade }));
      else if (controle !== 'nenhum') item.insumosConsumidos = [];
    }
    if (controle === 'nenhum') continue;
    if (controle === 'insumos') {
      let custo = 0;
      let custoDisponivel = true;
      for (const ingrediente of ficha || []) {
        const p = porId.get(String(ingrediente.produtoId));
        if (!p) throw new Error(`Ingrediente não encontrado para ${produto.nome}`);
        insumos.push({ produto: p, quantidade: Number(ingrediente.quantidade) * qtd, unidade: ingrediente.unidade, produtoVenda: produto });
        const custoBase = custoPorBase(p);
        if (!(custoBase > 0)) custoDisponivel = false;
        custo += custoBase * paraBase(ingrediente.quantidade, ingrediente.unidade);
      }
      if (baixar && custoDisponivel) item.custoUnitarioHistorico = custo;
    } else {
      const movimento = !baixar && item.movimentoEstoque ? item.movimentoEstoque : dadosMovimentoEstoque(produto, item);
      const pecas = Number(movimento.pecas || 0);
      const pesoKg = Number(movimento.pesoKg || 0);
      if (baixar) {
        item.movimentoEstoque = { pecas, pesoKg };
        const { calcularCustoUnitarioVenda } = require('./estoqueInsumo');
        const custoPorPeca = produto.tipoProduto === 'producao' || produto.producaoPropria
          ? Number(produto.custoUnitario || produto.custoUnitarioBase || 0)
          : calcularCustoUnitarioVenda(produto);
        const custo = produtoControlaPeso(produto) ? custoPorPeca / Number(produto.pesoPorUnidade) : custoPorPeca;
        if (custo > 0) item.custoUnitarioHistorico = custo;
      }
      const key = String(item.produtoId);
      const anterior = totais.get(key) || { pecas: 0, pesoKg: 0 };
      totais.set(key, { pecas: anterior.pecas + pecas, pesoKg: anterior.pesoKg + pesoKg });
    }
  }
  // Save ingredient changes before conditional increments to avoid stale shared stock.
  for (const consumo of insumos) {
    const { produto, quantidade, unidade, produtoVenda } = consumo;
    if (baixar) consumirInsumo(produto, quantidade, unidade);
    else reporInsumo(produto, quantidade, unidade);
    await produto.save({ session });
    await StockMovement.create([{
      produtoId: produto._id, produtoNome: produto.nome, tipo: baixar ? 'saida' : 'entrada',
      origem: baixar ? 'insumos' : null, destino: baixar ? null : 'insumos', quantidade, unidade,
      observacao: `${baixar ? 'Consumo' : 'Estorno'} do produto Coz ${produtoVenda.nome}`, createdBy: null,
    }], { session });
  }
  for (const produto of porId.values()) {
    if (produto.isModified('estoque') || produto.isModified('estoquePesoKg') || produto.isModified('estoquePesoNormalizado')) await produto.save({ session });
  }
  for (const [produtoId, movimento] of totais) {
    const produto = porId.get(produtoId);
    const controlaPeso = produtoControlaPeso(produto) || movimento.pesoKg > 0;
    const filtro = { _id: produtoId };
    if (baixar) {
      filtro.estoque = { $gte: movimento.pecas };
      if (controlaPeso) filtro.estoquePesoKg = { $gte: movimento.pesoKg };
    }
    const sinal = baixar ? -1 : 1;
    const inc = { estoque: sinal * movimento.pecas };
    if (controlaPeso) inc.estoquePesoKg = sinal * movimento.pesoKg;
    const atualizado = await Product.findOneAndUpdate(filtro, { $inc: inc }, { new: true, session });
    if (!atualizado) throw new Error(`Estoque insuficiente para ${produto.nome}`);
    await StockMovement.create([{
      produtoId, produtoNome: produto.nome, tipo: baixar ? 'saida' : 'entrada',
      origem: baixar ? 'venda' : null, destino: baixar ? null : 'venda',
      quantidade: Math.max(0.001, movimento.pesoKg || movimento.pecas),
      quantidadePecas: movimento.pecas, pesoKg: movimento.pesoKg,
      tipoVenda: movimento.pesoKg > 0 && movimento.pecas === 0 ? 'peso' : (controlaPeso ? 'inteiro' : 'unidade'), createdBy: null,
    }], { session });
  }
}
module.exports = { ajustarEstoque };

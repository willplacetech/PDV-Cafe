const Product = require('../models/Product');
const Recipe = require('../models/Recipe');
const { calcularCustoDaFichaTecnica } = require('./estoqueInsumo');

const fila = [];
const pendentes = new Set();
let processando = false;

const atualizarProduto = async (produto, resultado, divisor = 1) => {
  const disponivel = resultado.fonte === 'insumo' && Number(divisor) > 0;
  const custo = disponivel ? Number(resultado.custoTotal) / Number(divisor) : 0;
  await Product.updateOne({ _id: produto._id }, {
    $set: {
      custoCalculado: disponivel ? custo : null,
      custo: disponivel ? custo : 0,
      custoUnitario: disponivel ? custo : 0,
      dataUltimoCalculo: new Date(),
      fonteCalculo: resultado.fonte,
      custoUltimoSalvo: disponivel ? custo : 0,
    },
  });
};

const recalcular = async (insumoId) => {
  const receitas = await Recipe.find({ ingredientes: { $elemMatch: { produtoId: insumoId } } })
    .populate('produtoId', 'tipoProduto aFazer')
    .lean();
  const produtosComReceita = new Set();

  for (const receita of receitas) {
    const resultado = await calcularCustoDaFichaTecnica(receita.ingredientes);
    const tipoProduto = receita.produtoId?.tipoProduto || (receita.produtoId?.aFazer ? 'coz' : 'producao');
    const divisor = tipoProduto === 'coz' ? 1 : Number(receita.rendimento || 1);
    const disponivel = resultado.fonte === 'insumo';
    const custoTotal = disponivel ? Number(resultado.custoTotal) : 0;
    const custoUnitario = disponivel ? custoTotal / divisor : 0;
    await Recipe.updateOne({ _id: receita._id }, { $set: { custoInsumosTotal: custoTotal, custoTotal, custoUnitario } });
    if (receita.produtoId?._id) {
      produtosComReceita.add(String(receita.produtoId._id));
      await atualizarProduto({ _id: receita.produtoId._id }, resultado, divisor);
    }
  }

  const produtos = await Product.find({ tipo: 'venda', 'fichaTecnica.produtoId': insumoId })
    .select('_id fichaTecnica')
    .lean();
  for (const produto of produtos) {
    if (produtosComReceita.has(String(produto._id))) continue;
    const resultado = await calcularCustoDaFichaTecnica(produto.fichaTecnica);
    await atualizarProduto(produto, resultado);
  }
};

const processar = async () => {
  if (processando) return;
  processando = true;
  try {
    while (fila.length) {
      const insumoId = fila.shift();
      pendentes.delete(String(insumoId));
      try {
        await recalcular(insumoId);
      } catch (error) {
        console.error(`Falha ao recalcular custos do insumo ${insumoId}:`, error.message);
      }
    }
  } finally {
    processando = false;
  }
};

const enfileirarRecalculoPorInsumo = (insumoId) => {
  const id = String(insumoId);
  if (pendentes.has(id)) return;
  pendentes.add(id);
  fila.push(insumoId);
  setImmediate(processar);
};

module.exports = { enfileirarRecalculoPorInsumo };

require('dotenv').config();
const mongoose = require('mongoose');
const Product = require('../models/Product');
const Production = require('../models/Production');
const {
  fatoresBase,
  paraBase,
  unidadeControle,
  unidadeBase,
  conteudoPorEmbalagemBase,
  estoqueTotalBase,
} = require('../utils/estoqueInsumo');

const dataLocal = () => {
  const agora = new Date();
  return `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, '0')}-${String(agora.getDate()).padStart(2, '0')}`;
};

const intervaloDoDia = (data) => {
  const inicio = new Date(`${data}T00:00:00-03:00`);
  return { inicio, fim: new Date(inicio.getTime() + 24 * 60 * 60 * 1000) };
};

const calcularCorrecao = (produto, quantidade, unidade) => {
  const controle = unidadeControle(produto);
  const conteudo = conteudoPorEmbalagemBase(produto);
  if (!conteudo || !['mg', 'g', 'kg', 'ml', 'l', 'un'].includes(controle)) return 0;
  const unidadesAntigasDiretas = ['kg', 'L', 'un'];
  const quantidadeBaseAtual = paraBase(quantidade, unidade);
  const quantidadeBaseAntiga = unidadesAntigasDiretas.includes(unidade)
    ? Number(quantidade || 0)
    : quantidadeBaseAtual;
  const baixaAntigaEmEmbalagens = quantidadeBaseAntiga / (fatoresBase[controle] || 1);
  const baixaCorretaEmEmbalagens = quantidadeBaseAtual / conteudo;
  return (baixaAntigaEmEmbalagens - baixaCorretaEmEmbalagens) * conteudo;
};

const aplicarCorrecao = (produto, deltaBase) => {
  const conteudo = conteudoPorEmbalagemBase(produto);
  const totalBase = estoqueTotalBase(produto) + deltaBase;
  if (totalBase < -0.000001) throw new Error(`Correção deixaria estoque negativo para ${produto.nome}`);
  const totalNormalizado = Math.max(0, totalBase);
  const fechadas = conteudo > 0 ? Math.floor(totalNormalizado / conteudo) : totalNormalizado;
  const aberto = conteudo > 0 ? Number((totalNormalizado - (fechadas * conteudo)).toFixed(6)) : 0;
  if (produto.tipo === 'venda' && produto.usavelEmReceita) {
    produto.estoque = fechadas;
  } else {
    produto.estoqueEmbalagens = fechadas;
    produto.estoqueInsumos = fechadas;
  }
  produto.estoqueConteudoAberto = aberto / (fatoresBase[unidadeBase(produto)] || 1);
};

const main = async () => {
  if (!process.env.MONGO_URI) throw new Error('Defina MONGO_URI antes de executar a correção.');
  const data = process.argv.find((arg) => arg.startsWith('--data='))?.slice(7) || dataLocal();
  const antesDe = process.argv.find((arg) => arg.startsWith('--before='))?.slice(9);
  const todasAsDatas = process.argv.includes('--all');
  const aplicar = process.argv.includes('--apply') && process.argv.includes('--confirm');
  const { inicio, fim } = intervaloDoDia(data);
  await mongoose.connect(process.env.MONGO_URI);
  const limite = antesDe ? new Date(antesDe) : fim;
  const filtroData = todasAsDatas ? { $lt: limite } : { $gte: inicio, $lt: limite };
  const producoes = await Production.find({
    createdAt: filtroData,
    observacao: { $not: /\[baixa corrigida em /i },
  }).sort({ createdAt: 1 }).lean();
  const porProduto = new Map();

  for (const producao of producoes) {
    for (const insumo of producao.insumos || []) {
      const produtoId = String(insumo.produtoId);
      const atual = porProduto.get(produtoId) || { produtoNome: insumo.nome, insumos: [] };
      atual.insumos.push(insumo);
      porProduto.set(produtoId, atual);
    }
  }

  let candidatos = 0;
  for (const [produtoId, resumo] of porProduto) {
    const produto = await Product.findById(produtoId);
    if (!produto) continue;
    const deltaBase = resumo.insumos.reduce((total, insumo) => total + calcularCorrecao(produto, insumo.quantidade, insumo.unidade), 0);
    if (Math.abs(deltaBase) < 0.000001) continue;
    candidatos += 1;
    const fator = fatoresBase[unidadeBase(produto)] || 1;
    console.log(`${produto.nome}: ajuste ${(deltaBase / fator).toFixed(6)} ${unidadeBase(produto)}; saldo atual ${(estoqueTotalBase(produto) / fator).toFixed(6)}`);
    if (aplicar) {
      aplicarCorrecao(produto, deltaBase);
      await produto.save();
      console.log(`  saldo corrigido: ${(estoqueTotalBase(produto) / fator).toFixed(6)} ${unidadeBase(produto)}`);
    }
  }

  if (aplicar && candidatos > 0) {
    const marcador = `[baixa corrigida em ${new Date().toISOString()}]`;
    await Production.updateMany(
      { _id: { $in: producoes.map((producao) => producao._id) } },
      [{ $set: { observacao: { $trim: { input: { $concat: [{ $ifNull: ['$observacao', ''] }, ' ', marcador] } } } } }],
    );
  }

  console.log(`${aplicar ? 'Produtos corrigidos' : 'Produtos que seriam corrigidos'}: ${candidatos}`);
  await mongoose.disconnect();
};

main().catch(async (error) => {
  console.error(error.message);
  await mongoose.disconnect();
  process.exitCode = 1;
});

require('dotenv').config();
const mongoose = require('mongoose');
const Product = require('../models/Product');
const { normalizarUnidade } = require('../utils/unidades');

const conversao = {
  g: { unidade: 'kg', fator: 0.001 },
  mg: { unidade: 'kg', fator: 0.000001 },
  ml: { unidade: 'L', fator: 0.001 },
  l: { unidade: 'L', fator: 1 },
  L: { unidade: 'L', fator: 1 },
  kg: { unidade: 'kg', fator: 1 },
  un: { unidade: 'un', fator: 1 },
  lata: { unidade: 'un', fator: 1 },
  caixa: { unidade: 'un', fator: 1 },
  pacote: { unidade: 'un', fator: 1 },
  rolo: { unidade: 'un', fator: 1 },
  dz: { unidade: 'un', fator: 1 },
};

const normalizar = (produto) => {
  const unidadeOrigem = produto.unidade || produto.unidadeConteudo || produto.unidadeCompra || 'un';
  const regra = conversao[unidadeOrigem] || conversao[normalizarUnidade(unidadeOrigem)] || conversao.un;
  const quantidadeOrigem = Number(produto.quantidade ?? produto.conteudoPorEmbalagem ?? 1);
  const quantidade = Number((quantidadeOrigem * regra.fator).toFixed(regra.unidade === 'un' ? 2 : 3));
  const preco = Number(produto.preco || 0);
  const precoNormalizado = regra.fator < 1 ? Number((preco / regra.fator).toFixed(2)) : preco;
  const rendimento = Number(produto.rendimento ?? produto.rendimentoPorUnidadeCompra ?? 0);
  const unidadeVendaOrigem = produto.unidadeVenda || regra.unidade;
  const regraVenda = conversao[unidadeVendaOrigem] || conversao[normalizarUnidade(unidadeVendaOrigem)] || conversao.un;

  return {
    unidade: regra.unidade,
    quantidade: Math.max(regra.unidade === 'un' ? 0.01 : 0.001, quantidade || 1),
    rendimento: rendimento > 0 ? rendimento : null,
    preco: precoNormalizado,
    unidadeCompra: regra.unidade,
    unidadeConteudo: regra.unidade,
    unidadeVenda: regraVenda.unidade,
    conteudoPorEmbalagem: Math.max(regra.unidade === 'un' ? 0.01 : 0.001, quantidade || 1),
  };
};

const main = async () => {
  if (!process.env.MONGO_URI) throw new Error('Defina MONGO_URI antes de executar a migração.');
  await mongoose.connect(process.env.MONGO_URI);
  const produtos = await Product.collection.find({}).toArray();
  const operacoes = produtos.map((produto) => ({
    updateOne: {
      filter: { _id: produto._id },
      update: { $set: normalizar(produto) },
    },
  }));

  console.log(`Produtos analisados: ${produtos.length}`);
  if (!process.argv.includes('--apply')) {
    console.log('Nenhuma alteração aplicada. Use --apply para gravar a migração.');
    await mongoose.disconnect();
    return;
  }

  if (operacoes.length) await Product.collection.bulkWrite(operacoes, { ordered: false });
  console.log(`Migração aplicada: ${operacoes.length} produto(s) normalizado(s).`);
  await mongoose.disconnect();
};

main().catch(async (error) => {
  console.error(error.message);
  await mongoose.disconnect();
  process.exitCode = 1;
});

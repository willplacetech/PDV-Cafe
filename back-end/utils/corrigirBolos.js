const bolo = /bolo|rechead|caseir/i;

const corrigirProdutosBolo = async (Product) => {
  const produtos = await Product.find({ unidadeVenda: 'g', nome: { $regex: bolo } });
  let produtosCorrigidos = 0;
  for (const produto of produtos) {
    produto.unidadeVenda = 'kg';
    produto.vendidoFracionado = true;
    produto.preco = Number(produto.preco || 0) * 1000;
    produto.custo = Number(produto.custo || 0) * 1000;
    produto.custoUnitario = Number(produto.custoUnitario || 0) * 1000;
    produto.estoque = Number(produto.estoque || 0) / 1000;
    await produto.save();
    produtosCorrigidos += 1;
  }
  return produtosCorrigidos;
};

const corrigirBolos = async (Model) => {
  const documentos = await Model.find({ 'itens.unidadeVenda': 'g', 'itens.nome': { $regex: bolo } });
  let itensCorrigidos = 0;

  for (const documento of documentos) {
    let alterado = false;
    for (const item of documento.itens || []) {
      if (item.unidadeVenda !== 'g' || !bolo.test(item.nome || '')) continue;
      item.quantidade = Number(item.quantidade || 0) / 1000;
      item.precoUnitario = Number(item.precoUnitario || 0) * 1000;
      item.unidadeVenda = 'kg';
      alterado = true;
      itensCorrigidos += 1;
    }
    if (alterado) await documento.save();
  }
  return itensCorrigidos;
};

module.exports = { corrigirBolos, corrigirProdutosBolo };
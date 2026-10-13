const { produtoControlaPeso, estoquePesoAtualKg } = require('./estoqueProduto');

const resumirEstoque = (produto) => {
  const ehInsumo = produto.tipo === 'insumo';
  if (ehInsumo) {
    const embalagens = Number(produto.estoqueEmbalagens ?? produto.estoqueInsumos ?? produto.estoque ?? 0);
    const conteudo = Number(produto.conteudoPorEmbalagem || 0);
    const aberto = Number(produto.estoqueConteudoAberto || 0);
    const unidade = produto.unidadeConteudo || produto.unidadeCompra || produto.unidade || 'un';
    const qtdAtual = conteudo > 0 ? embalagens * conteudo + aberto : embalagens + aberto;
    const minimo = Number(produto.estoqueMinimoBase)
      || (Number(produto.estoqueMinimoEmbalagens || 0) * (conteudo || 1))
      || Number(produto.estoqueMinimo || 0)
      || 5;
    return { qtdAtual, minimo, unidade };
  }

  if (produtoControlaPeso(produto)) {
    return {
      qtdAtual: estoquePesoAtualKg(produto),
      minimo: Number(produto.estoqueMinimo || 0) || 5,
      unidade: 'kg',
    };
  }

  return {
    qtdAtual: Number(produto.estoque || 0),
    minimo: Number(produto.estoqueMinimo || 0) || 5,
    unidade: produto.unidadeVenda || 'un',
  };
};

const ehProdutoCozNaHora = (produto) => (
  produto.tipoProduto === 'coz'
  || produto.aFazer === true
  || produto.categoria === 'Pratos na Hora'
  || produto.producaoPropria === true
);

const listarEstoqueBaixo = (produtos) => produtos
  .filter((produto) => !ehProdutoCozNaHora(produto))
  .map((produto) => ({ produto, ...resumirEstoque(produto) }))
  .filter(({ qtdAtual, minimo }) => qtdAtual <= minimo)
  .sort((a, b) => a.qtdAtual - b.qtdAtual || a.produto.nome.localeCompare(b.produto.nome, 'pt-BR'));

module.exports = { listarEstoqueBaixo, resumirEstoque };

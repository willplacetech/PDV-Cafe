const fatoresBase = { g: 1, kg: 1000, ml: 1, l: 1000, un: 1 };

const paraBase = (quantidade, unidade) => Number(quantidade || 0) * (fatoresBase[unidade] || 1);

const unidadeBase = (produto = {}) => produto.unidadeConteudo || (['kg', 'g', 'l', 'ml'].includes(produto.unidadeVenda) ? produto.unidadeVenda : 'g');

const conteudoPorEmbalagemBase = (produto = {}) => {
  const conteudo = Number(produto.conteudoPorEmbalagem || 0);
  if (conteudo > 0) return paraBase(conteudo, unidadeBase(produto));
  const legado = Number(produto.rendimentoPorUnidadeCompra || 0);
  if (legado > 0) return paraBase(legado, produto.unidadeCompra === 'kg' ? 'kg' : produto.unidadeCompra === 'l' ? 'l' : 'g');
  return 0;
};

const embalagensFechadas = (produto = {}) => Number(produto.estoqueEmbalagens ?? produto.estoqueInsumos ?? 0);

const conteudoAberto = (produto = {}) => Number(produto.estoqueConteudoAberto || 0);

const estoqueTotalBase = (produto = {}) => (embalagensFechadas(produto) * conteudoPorEmbalagemBase(produto)) + conteudoAberto(produto);

const custoPorBase = (produto = {}) => {
  const preco = Number(produto.precoCompra || 0);
  const conteudo = conteudoPorEmbalagemBase(produto);
  return preco > 0 && conteudo > 0 ? preco / conteudo : 0;
};

const resumoEstoqueInsumo = (produto = {}) => {
  const totalBase = estoqueTotalBase(produto);
  const conteudoBase = conteudoPorEmbalagemBase(produto);
  const unidade = unidadeBase(produto);
  const fator = fatoresBase[unidade] || 1;
  return {
    embalagensFechadas: Math.max(0, embalagensFechadas(produto)),
    conteudoAberto: conteudoAberto(produto),
    conteudoPorEmbalagem: conteudoBase / fator,
    unidadeConteudo: unidade,
    totalBase,
    total: totalBase / fator,
    totalKg: ['g', 'kg'].includes(unidade) ? totalBase / 1000 : undefined,
  };
};

const consumirInsumo = (produto, quantidade, unidade) => {
  const quantidadeBase = paraBase(quantidade, unidade);
  const conteudoEmbalagem = conteudoPorEmbalagemBase(produto);
  if (quantidadeBase <= 0) throw new Error(`Quantidade inválida para o insumo ${produto.nome}`);
  if (conteudoEmbalagem <= 0 || !['g', 'kg', 'ml', 'l'].includes(unidadeBase(produto))) {
    const disponivel = embalagensFechadas(produto);
    if (disponivel < quantidadeBase) throw new Error(`Estoque de insumos insuficiente para ${produto.nome}`);
    produto.estoqueEmbalagens = disponivel - quantidadeBase;
    produto.estoqueInsumos = produto.estoqueEmbalagens;
    return { embalagensConsumidas: quantidadeBase, conteudoConsumido: quantidadeBase, conteudoRestante: 0 };
  }

  if (estoqueTotalBase(produto) < quantidadeBase) throw new Error(`Estoque insuficiente de ${produto.nome}: faltam ${quantidadeBase} ${unidadeBase(produto)}`);
  let aberto = conteudoAberto(produto);
  let fechadas = embalagensFechadas(produto);
  let restante = quantidadeBase;
  const doAberto = Math.min(aberto, restante);
  aberto -= doAberto;
  restante -= doAberto;
  const embalagensConsumidas = restante > 0 ? Math.ceil(restante / conteudoEmbalagem) : 0;
  fechadas -= embalagensConsumidas;
  const sobraDaUltima = (embalagensConsumidas * conteudoEmbalagem) - restante;
  aberto = restante > 0 ? sobraDaUltima : aberto;
  produto.estoqueEmbalagens = fechadas;
  produto.estoqueConteudoAberto = aberto;
  produto.estoqueInsumos = fechadas;
  return { embalagensConsumidas, conteudoConsumido: quantidadeBase, conteudoRestante: aberto };
};

module.exports = { paraBase, unidadeBase, conteudoPorEmbalagemBase, embalagensFechadas, conteudoAberto, estoqueTotalBase, resumoEstoqueInsumo, custoPorBase, consumirInsumo };
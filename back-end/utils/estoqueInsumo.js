const fatoresBase = { mg: 0.001, g: 1, kg: 1000, ml: 1, l: 1000, un: 1 };

const paraBase = (quantidade, unidade) => Number(quantidade || 0) * (fatoresBase[unidade] || 1);

const unidadesDiretas = ['mg', 'g', 'kg', 'ml', 'l', 'un'];
const unidadesEmbalagem = ['lata', 'caixa', 'pacote', 'rolo'];

const unidadeControle = (produto = {}) => produto.tipo === 'venda' && produto.usavelEmReceita ? (produto.unidadeVenda || 'un') : (produto.unidadeCompra || produto.unidadeControle || 'un');

const unidadeBase = (produto = {}) => unidadesDiretas.includes(unidadeControle(produto))
  ? unidadeControle(produto)
  : (produto.unidadeConteudo || 'g');

const conteudoPorEmbalagemBase = (produto = {}) => {
  if (produto.tipo === 'venda' && produto.usavelEmReceita) {
    return paraBase(Number(produto.conteudoPorEmbalagem || 1), produto.unidadeConteudo || produto.unidadeVenda || 'un');
  }
  if (unidadesDiretas.includes(unidadeControle(produto))) return fatoresBase[unidadeControle(produto)];
  const conteudo = Number(produto.conteudoPorEmbalagem || 0);
  if (conteudo > 0) return paraBase(conteudo, unidadeBase(produto));
  const legado = Number(produto.rendimentoPorUnidadeCompra || 0);
  if (legado > 0) return paraBase(legado, produto.unidadeCompra === 'kg' ? 'kg' : produto.unidadeCompra === 'l' ? 'l' : 'g');
  return 0;
};

const embalagensFechadas = (produto = {}) => produto.tipo === 'venda' && produto.usavelEmReceita
  ? Number(produto.estoque || 0)
  : Number(produto.estoqueEmbalagens ?? produto.estoqueInsumos ?? 0);

const conteudoAberto = (produto = {}) => Number(produto.estoqueConteudoAberto || 0);

const estoqueTotalBase = (produto = {}) => (embalagensFechadas(produto) * conteudoPorEmbalagemBase(produto)) + conteudoAberto(produto);

const custoPorBase = (produto = {}) => {
  const preco = Number(produto.precoCompra || 0);
  const conteudo = conteudoPorEmbalagemBase(produto);
  return preco > 0 && conteudo > 0 ? preco / conteudo : 0;
};

const calcularCustoUnitarioBase = (precoCompra, conteudoPorEmbalagem, unidadeConteudo) => {
  const preco = Number(precoCompra || 0);
  const conteudo = Number(conteudoPorEmbalagem || 0);
  const unidade = (unidadesDiretas.includes(unidadeConteudo) ? unidadeConteudo : 'g') || 'g';
  if (preco <= 0 || conteudo <= 0) return 0;
  const base = paraBase(conteudo, unidade);
  if (base <= 0) return 0;
  return preco / base;
};

const calcularEstoqueMinimoBase = (estoqueMinimo, unidadeConteudo) => {
  const minimo = Number(estoqueMinimo || 0);
  const unidade = (unidadesDiretas.includes(unidadeConteudo) ? unidadeConteudo : 'g') || 'g';
  if (minimo <= 0) return 0;
  return paraBase(minimo, unidade);
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
    custoUnitarioBase: custoPorBase(produto),
    precoPorEmbalagem: Number(produto.precoCompra || 0),
  };
};

const conversaoUnidadeMedida = (produto = {}) => {
  const fator = fatoresBase[unidadeBase(produto)] || 1;
  const base = Number(produto.estoqueMinimoBase || 0);
  return base > 0 ? base / fator : undefined;
};

const calcularResumoCompleto = (produto = {}) => {
  const resumo = resumoEstoqueInsumo(produto);
  const unidade = resumo.unidadeConteudo;
  const fator = fatoresBase[unidade] || 1;
  const precoPorEmbalagem = Number(produto.precoCompra || 0);
  const conteudoBase = resumo.conteudoPorEmbalagem * fator;
  const custoBase = precoPorEmbalagem > 0 && conteudoBase > 0 ? precoPorEmbalagem / conteudoBase : 0;
  const ePeso = ['g', 'kg', 'mg'].includes(unidade);
  const eVolume = ['l', 'ml'].includes(unidade);
  const eUnidade = unidade === 'un';
  return {
    ...resumo,
    precoPorEmbalagem,
    conteudoPorEmbalagem: resumo.conteudoPorEmbalagem,
    unidadeConteudo: unidade,
    embalagensFechadas: resumo.embalagensFechadas,
    total: resumo.total,
    totalBase: resumo.totalBase,
    totalKg: resumo.totalKg,
    custoUnitarioBase: custoBase,
    custoPorKg: ePeso ? custoBase * 1000 : undefined,
    custoPor100g: ePeso ? custoBase * 100 : undefined,
    custoPorGrama: ePeso ? custoBase : undefined,
    custoPorLitro: eVolume ? custoBase * 1000 : undefined,
    custoPor100ml: eVolume ? custoBase * 100 : undefined,
    custoPorGramaBase: custoBase,
    custoPorUnidade: eUnidade ? custoBase : undefined,
    estoqueMinimo: conversaoUnidadeMedida(produto),
    estoqueMinimoBase: Number(produto.estoqueMinimoBase || 0),
    unidadeMinimo: unidade,
    abaixoMinimo: resumo.totalBase > 0 && Number(produto.estoqueMinimoBase || 0) > 0 && resumo.totalBase < Number(produto.estoqueMinimoBase || 0),
    esgotado: resumo.totalBase <= 0,
  };
};

const ajustarEstoque = (produto, deltaEmbalagens) => {
  const embalagensAntes = embalagensFechadas(produto);
  const conteudoBase = conteudoPorEmbalagemBase(produto);
  const unidade = unidadeBase(produto);
  const fator = fatoresBase[unidade] || 1;
  const totalAntes = (embalagensAntes * conteudoBase) / fator;
  const novoTotal = embalagensAntes + deltaEmbalagens;
  if (novoTotal < 0) throw new Error(`Não é possível reduzir ${Math.abs(deltaEmbalagens)} embalagem(s): o estoque atual é ${embalagensAntes}`);
  produto.estoqueEmbalagens = novoTotal;
  produto.estoqueInsumos = novoTotal;
  const embalagensDepois = embalagensFechadas(produto);
  const totalDepois = (embalagensDepois * conteudoBase) / fator;
  return {
    embalagensAntes,
    embalagensDepois,
    delta: deltaEmbalagens,
    unidadeConteudo: unidade,
    unidadeEmbalagem: produto.unidadeCompra || 'embalagem',
    totalAntes,
    totalDepois,
    totalAntesKg: ['g', 'kg'].includes(unidade) ? (embalagensAntes * conteudoBase) / 1000 : undefined,
    totalDepoisKg: ['g', 'kg'].includes(unidade) ? (embalagensDepois * conteudoBase) / 1000 : undefined,
  };
};

const consumirInsumo = (produto, quantidade, unidade) => {
  const quantidadeBase = paraBase(quantidade, unidade);
  const conteudoEmbalagem = conteudoPorEmbalagemBase(produto);
  const controle = unidadeControle(produto);
  if (quantidadeBase <= 0) throw new Error(`Quantidade inválida para o insumo ${produto.nome}`);
  if (unidadesDiretas.includes(controle)) {
    const estoqueBase = embalagensFechadas(produto) * conteudoEmbalagem;
    if (estoqueBase < quantidadeBase) throw new Error(`Estoque insuficiente de ${produto.nome}: disponível ${estoqueBase / fatoresBase[controle]} ${controle}`);
    const consumidoNaUnidade = quantidadeBase / fatoresBase[controle];
    const estoqueAtual = embalagensFechadas(produto) - consumidoNaUnidade;
    produto.estoqueEmbalagens = estoqueAtual;
    produto.estoqueInsumos = estoqueAtual;
    return { embalagensConsumidas: 0, conteudoConsumido: quantidadeBase, quantidadeConvertida: consumidoNaUnidade, unidadeControle: controle, conteudoRestante: 0, mensagem: `${quantidade} ${unidade} equivalem a ${consumidoNaUnidade} ${controle} - desconto aplicado` };
  }

  const reporInsumo = (produto, quantidade, unidade) => {
    const quantidadeBase = paraBase(quantidade, unidade);
    const conteudoEmbalagem = conteudoPorEmbalagemBase(produto);
    const controle = unidadeControle(produto);
    if (quantidadeBase <= 0) throw new Error(`Quantidade inválida para o insumo ${produto.nome}`);
    if (unidadesDiretas.includes(controle)) {
      const acrescimo = quantidadeBase / (fatoresBase[controle] || 1);
      produto.estoqueEmbalagens = embalagensFechadas(produto) + acrescimo;
      produto.estoqueInsumos = produto.estoqueEmbalagens;
      return;
    }
    const totalDepois = estoqueTotalBase(produto) + quantidadeBase;
    const fechadas = conteudoEmbalagem > 0 ? Math.floor(totalDepois / conteudoEmbalagem) : totalDepois;
    produto.estoqueEmbalagens = fechadas;
    produto.estoqueInsumos = fechadas;
    produto.estoqueConteudoAberto = conteudoEmbalagem > 0 ? totalDepois - (fechadas * conteudoEmbalagem) : 0;
  };
  if (conteudoEmbalagem <= 0) {
  module.exports = { fatoresBase, paraBase, unidadesDiretas, unidadesEmbalagem, unidadeControle, unidadeBase, conteudoPorEmbalagemBase, embalagensFechadas, conteudoAberto, estoqueTotalBase, resumoEstoqueInsumo, calcularCustoUnitarioBase, calcularEstoqueMinimoBase, consumirInsumo, reporInsumo, ajustarEstoque };
    if (disponivel < quantidadeBase) throw new Error(`Estoque de insumos insuficiente para ${produto.nome}`);
    produto.estoqueEmbalagens = disponivel - quantidadeBase;
    produto.estoqueInsumos = produto.estoqueEmbalagens;
    return { embalagensConsumidas: quantidadeBase, conteudoConsumido: quantidadeBase, quantidadeConvertida: quantidadeBase, unidadeControle: controle, conteudoRestante: 0, mensagem: `${quantidade} ${unidade} equivalem a ${quantidadeBase} ${controle} - desconto aplicado` };
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
  const quantidadeConvertida = quantidadeBase / conteudoEmbalagem;
  return { embalagensConsumidas, conteudoConsumido: quantidadeBase, quantidadeConvertida, unidadeControle: controle, conteudoRestante: aberto, mensagem: `${quantidade} ${unidade} equivalem a ${Number(quantidadeConvertida.toFixed(4))} ${controle} - desconto aplicado` };
};

module.exports = { fatoresBase, paraBase, unidadesDiretas, unidadesEmbalagem, unidadeControle, unidadeBase, conteudoPorEmbalagemBase, embalagensFechadas, conteudoAberto, estoqueTotalBase, resumoEstoqueInsumo, calcularResumoCompleto, custoPorBase, calcularCustoUnitarioBase, calcularEstoqueMinimoBase, consumirInsumo, ajustarEstoque };
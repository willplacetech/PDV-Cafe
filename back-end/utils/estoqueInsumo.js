const fatoresBase = { mg: 0.001, g: 1, kg: 1000, ml: 1, l: 1000, L: 1000, un: 1 };
const unidadesPermitidas = ['kg', 'L', 'un'];

const paraBase = (quantidade, unidade) => Number(quantidade || 0) * (fatoresBase[unidade] || 1);

const unidadesDiretas = ['mg', 'g', 'kg', 'ml', 'l', 'L', 'un'];
const unidadesEmbalagem = ['lata', 'caixa', 'pacote', 'rolo'];

const unidadeControle = (produto = {}) => produto.unidade || (produto.tipo === 'venda' && produto.usavelEmReceita ? (produto.unidadeVenda || 'un') : (produto.unidadeCompra || produto.unidadeControle || 'un'));

const unidadeBase = (produto = {}) => {
  if (unidadesPermitidas.includes(produto.unidade)) return produto.unidade;
  if (produto.unidadeConteudo && unidadesDiretas.includes(produto.unidadeConteudo)) return produto.unidadeConteudo;
  const controle = unidadeControle(produto);
  return unidadesDiretas.includes(controle) ? controle : (produto.unidadeConteudo || 'g');
};

const conteudoPorEmbalagemBase = (produto = {}) => {
  // Para insumos, sempre usar conteudoPorEmbalagem
  if (produto.tipo === 'insumo') {
    const conteudo = Number(produto.conteudoPorEmbalagem || 0);
    if (conteudo > 0 && produto.unidadeConteudo && unidadesDiretas.includes(produto.unidadeConteudo)) {
      return paraBase(conteudo, produto.unidadeConteudo);
    }
    if (conteudo > 0) return paraBase(conteudo, unidadeBase(produto));
    return 0;
  }
  // Para produtos de venda que são usáveis em receita
  if (produto.tipo === 'venda' && produto.usavelEmReceita) {
    return paraBase(Number(produto.conteudoPorEmbalagem || 1), produto.unidadeConteudo || produto.unidadeVenda || 'un');
  }
  // Para produtos de venda com unidade direta (kg, L, un)
  if (produto.unidade && unidadesPermitidas.includes(produto.unidade)) {
    return paraBase(Number(produto.conteudoPorEmbalagem ?? 1), produto.unidade);
  }
  // Fallback para unidade de controle
  if (unidadesDiretas.includes(unidadeControle(produto))) {
    const conteudo = Number(produto.conteudoPorEmbalagem);
    if (conteudo > 0 && produto.unidadeConteudo && unidadesDiretas.includes(produto.unidadeConteudo)) {
      return paraBase(conteudo, produto.unidadeConteudo);
    }
    return fatoresBase[unidadeControle(produto)];
  }
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

const estoqueTotalBase = (produto = {}) => (embalagensFechadas(produto) * conteudoPorEmbalagemBase(produto)) + paraBase(conteudoAberto(produto), unidadeBase(produto));

const custoPorBase = (produto = {}) => {
  const preco = Number(produto.precoCompra || 0);
  if (produto.unidade && unidadesPermitidas.includes(produto.unidade)) {
    const quantidade = Number(produto.quantidade ?? produto.conteudoPorEmbalagem ?? 1);
    return preco > 0 && quantidade > 0 ? preco / paraBase(quantidade, produto.unidade) : 0;
  }
  const conteudo = conteudoPorEmbalagemBase(produto);
  return preco > 0 && conteudo > 0 ? preco / conteudo : 0;
};

const calcularCustoUnitarioBase = (precoCompra, conteudoPorEmbalagem, unidadeConteudo) => {
  const preco = Number(precoCompra || 0);
  const conteudo = Number(conteudoPorEmbalagem || 0);
  const unidade = (unidadesPermitidas.includes(unidadeConteudo) || unidadesDiretas.includes(unidadeConteudo) ? unidadeConteudo : 'g') || 'g';
  if (preco <= 0 || conteudo <= 0) return 0;
  const base = paraBase(conteudo, unidade);
  if (base <= 0) return 0;
  return preco / base;
};

const calcularEstoqueMinimoBase = (estoqueMinimo, unidadeConteudo) => {
  const minimo = Number(estoqueMinimo || 0);
  const unidade = (unidadesPermitidas.includes(unidadeConteudo) || unidadesDiretas.includes(unidadeConteudo) ? unidadeConteudo : 'g') || 'g';
  if (minimo <= 0) return 0;
  return paraBase(minimo, unidade);
};

const deveAplicarConversaoRevenda = (produto = {}) => {
  const rendimento = Number(produto.rendimento ?? produto.rendimentoPorUnidadeCompra ?? 0);
  const unidadeCompra = produto.unidade || produto.unidadeCompra || 'kg';
  const unidadeVenda = produto.unidadeVenda || 'un';
  return rendimento > 1 && unidadeCompra !== unidadeVenda;
};

const calcularCustoUnitarioVenda = (produto = {}) => {
  if (!deveAplicarConversaoRevenda(produto)) return Number(produto.precoCompra || produto.custoUnitarioBase || 0);
  const prec = Number(produto.precoCompra ?? produto.preco ?? 0);
  const rendimento = Number(produto.rendimento ?? produto.rendimentoPorUnidadeCompra ?? 0);
  if (prec <= 0 || rendimento <= 0) return 0;
  return prec / rendimento;
};

const estoqueEmUnidadeVenda = (produto = {}) => {
  if (!deveAplicarConversaoRevenda(produto)) return Number(produto.estoque || 0);
  const estoque = Number(produto.estoque || 0);
  const rendimento = Number(produto.rendimento ?? produto.rendimentoPorUnidadeCompra ?? 0);
  return rendimento > 0 ? estoque * rendimento : estoque;
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
    totalKg: ['kg', 'g'].includes(unidade) ? totalBase / 1000 : undefined,
    custoUnitarioBase: custoPorBase(produto),
    precoPorEmbalagem: Number(produto.precoCompra || 0),
  };
};

const conversaoUnidadeMedida = (produto = {}) => {
  const unidade = unidadeBase(produto);
  const fator = fatoresBase[unidade] || 1;
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
  const ePeso = ['kg', 'g'].includes(unidade);
  const eVolume = ['L', 'l', 'ml'].includes(unidade);
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
  if (produto.tipo === 'venda' && produto.usavelEmReceita) produto.estoque = novoTotal;
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

/**
 * Calcula o custo unitário de um produto a partir da ficha técnica
 * @param {Array} fichaTecnica - Array de ingredientes [{produtoId, quantidade, unidade}]
 * @returns {Object} { custoTotal, detalhes: [{nome, quantidade, unidade, custoUnitarioBase, custoItem, disponivel, faltante}] }
 */
const calcularCustoDaFichaTecnica = async (fichaTecnica) => {
  if (!Array.isArray(fichaTecnica) || fichaTecnica.length === 0) {
    return { custoTotal: 0, detalhes: [], fonte: 'indisponivel', mensagem: 'Sem ficha técnica cadastrada' };
  }

  const Product = require('../models/Product');
  const idDoProduto = (item) => item?.produtoId?._id || item?.produtoId;
  const itensValidos = fichaTecnica.filter((item) => idDoProduto(item) && Number.isFinite(Number(item.quantidade)) && Number(item.quantidade) > 0);
  const ids = [...new Set(itensValidos.map((item) => String(idDoProduto(item))))];
  const insumos = await Product.find({ _id: { $in: ids } })
    .select('nome precoCompra custoUnitarioBase unidade unidadeVenda unidadeCompra unidadeConteudo conteudoPorEmbalagem tipo usavelEmReceita estoque estoqueInsumos estoqueEmbalagens estoqueConteudoAberto')
    .lean();
  const insumosPorId = new Map(insumos.map((insumo) => [String(insumo._id), insumo]));
  const detalhes = [];
  let custoTotal = 0;
  let todosDisponiveis = true;
  let algumIndisponivel = itensValidos.length !== fichaTecnica.length;

  for (const item of itensValidos) {
    const insumo = insumosPorId.get(String(idDoProduto(item)));
    
    if (!insumo) {
      detalhes.push({
        produtoId: item.produtoId,
        nome: 'Insumo não encontrado',
        quantidade: item.quantidade,
        unidade: item.unidade,
        custoUnitarioBase: null,
        custoItem: null,
        disponivel: false,
        faltante: true,
        status: 'erro',
      });
      todosDisponiveis = false;
      algumIndisponivel = true;
      continue;
    }

    // Calcular custo unitário base do insumo usando funções locais
    const resumo = calcularResumoCompleto(insumo);
    const custoUnitarioBase = Number(resumo.custoUnitarioBase || 0);
    
    // Converter quantidade para unidade base
    const quantidadeBase = paraBase(Number(item.quantidade), item.unidade);
    const custoItem = custoUnitarioBase > 0 ? quantidadeBase * custoUnitarioBase : null;
    if (custoItem === null) algumIndisponivel = true;
    else custoTotal += custoItem;

    const temEstoque = (resumo.totalBase || 0) > 0;
    if (!temEstoque) todosDisponiveis = false;
    if (custoUnitarioBase <= 0) algumIndisponivel = true;

    detalhes.push({
      produtoId: insumo._id,
      nome: insumo.nome,
      quantidade: item.quantidade,
      unidade: item.unidade,
      quantidadeBase,
      custoUnitarioBase,
      custoItem,
      disponivel: temEstoque,
      faltante: !temEstoque,
      status: custoUnitarioBase <= 0 ? 'sem_preco' : (temEstoque ? 'ok' : 'sem_estoque'),
    });
  }

  let fonte = 'insumo';
  let mensagem = '';
  if (detalhes.length === 0) {
    fonte = 'indisponivel';
    mensagem = 'Sem ficha técnica ou ingredientes inválidos';
  } else if (algumIndisponivel) {
    fonte = 'indisponivel';
    mensagem = 'Alguns insumos não têm preço de compra cadastrado';
  } else if (!todosDisponiveis) {
    mensagem = 'Atenção: algum insumo está em falta no estoque';
  } else {
    mensagem = 'Custo calculado com sucesso';
  }

  return { custoTotal, detalhes, fonte, mensagem };
};

const definirSaldoBase = (produto, totalBase) => {
  const conteudoEmbalagem = conteudoPorEmbalagemBase(produto);
  const fechadas = conteudoEmbalagem > 0 ? Math.floor((totalBase + 1e-9) / conteudoEmbalagem) : totalBase;
  const abertoBase = conteudoEmbalagem > 0 ? Math.max(0, totalBase - fechadas * conteudoEmbalagem) : 0;
  if (produto.tipo === 'venda' && produto.usavelEmReceita) produto.estoque = fechadas;
  produto.estoqueEmbalagens = fechadas;
  produto.estoqueInsumos = fechadas;
  produto.estoqueConteudoAberto = Number((abertoBase / (fatoresBase[unidadeBase(produto)] || 1)).toFixed(6));
};

const reporInsumo = (produto, quantidade, unidade) => {
  const quantidadeBase = paraBase(quantidade, unidade);
  if (!Number.isFinite(quantidadeBase) || quantidadeBase <= 0) throw new Error('Quantidade invalida para o insumo ' + produto.nome);
  definirSaldoBase(produto, estoqueTotalBase(produto) + quantidadeBase);
};

const consumirInsumo = (produto, quantidade, unidade) => {
  const quantidadeBase = paraBase(quantidade, unidade);
  const conteudoEmbalagem = conteudoPorEmbalagemBase(produto);
  const controle = unidadeControle(produto);
  if (quantidadeBase <= 0) throw new Error(`Quantidade inválida para o insumo ${produto.nome}`);
  
  // Sempre trabalhar em unidades base (kg, g, L, ml, un)
  const totalBase = estoqueTotalBase(produto);
  if (totalBase < quantidadeBase) throw new Error(`Estoque insuficiente de ${produto.nome}: disponível ${totalBase} ${unidadeBase(produto)}`);
  
  const novoTotalBase = totalBase - quantidadeBase;
  
  definirSaldoBase(produto, novoTotalBase);
  
  const quantidadeConvertida = conteudoEmbalagem > 0 ? quantidadeBase / conteudoEmbalagem : quantidadeBase;
  return { 
    embalagensConsumidas: quantidadeConvertida, 
    conteudoConsumido: quantidadeBase, 
    quantidadeConvertida, 
    unidadeControle: controle, 
    conteudoRestante: produto.estoqueConteudoAberto, 
    mensagem: `${quantidade} ${unidade} equivalem a ${Number(quantidadeConvertida.toFixed(4))} ${controle} - desconto aplicado` 
  };
};

module.exports = {
  fatoresBase,
  paraBase,
  unidadesDiretas,
  unidadesEmbalagem,
  unidadeControle,
  unidadeBase,
  conteudoPorEmbalagemBase,
  embalagensFechadas,
  conteudoAberto,
  estoqueTotalBase,
  resumoEstoqueInsumo,
  calcularResumoCompleto,
  custoPorBase,
  calcularCustoUnitarioBase,
  calcularEstoqueMinimoBase,
  deveAplicarConversaoRevenda,
  calcularCustoUnitarioVenda,
  estoqueEmUnidadeVenda,
  consumirInsumo,
  reporInsumo,
  ajustarEstoque,
  calcularCustoDaFichaTecnica,
};
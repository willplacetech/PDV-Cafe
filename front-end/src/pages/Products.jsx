import { useState, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import api from '../services/api.jsx';
import { useToast } from '../components/useToast.js';

const categoriasVenda = ['Bebidas Quentes', 'Bebidas geladas', 'Salgados', 'Doces', 'Congelados', 'Sorvetes', 'Pratos na Hora', 'Outros'];
const filtrosTipo = ['Todos', 'Estoque de Venda', 'Estoque de Insumos'];
const units = ['kg', 'L', 'un'];
const decimalStep = (unidade) => unidade === 'un' ? '0.01' : '0.001';
const decimalMinimum = (unidade) => unidade === 'un' ? 0.01 : 0.001;

const vazio = {
  codigo: '',
  nome: '',
  ncm: '',
  marcaReferencia: '',
  tipo: 'venda',
  unidade: 'kg',
  tipoProduto: 'revenda',
  usavelEmReceita: false,
  categoria: 'Bebidas Quentes',
  preco: '',
  descontosPorQuantidade: [],
  grupoDesconto: { nome: '', quantidadeMinima: '', precoPromocional: '', ativo: false },
  precoCompra: '',
  unidadeCompra: 'kg',
  conteudoPorEmbalagem: 1,
  unidadeConteudo: 'kg',
  estoqueEmbalagens: '',
  estoqueConteudoAberto: 0,
  estoqueMinimoEmbalagens: '',
  rendimentoPorUnidadeCompra: '',
  custo: '',
  custoCalculado: null,
  dataUltimoCalculo: null,
  fonteCalculo: 'indisponivel',
  estoque: '',
  estoqueInsumos: '',
  unidadeVenda: 'un',
  vendidoFracionado: false,
  aFazer: false,
  fichaTecnica: [],
  permitirVendaSemInsumo: false,
  producaoPropria: false,
  ativo: true,
};

export default function Products() {
  const [searchParams] = useSearchParams();
  const [produtos, setProdutos] = useState([]);
  const [fichas, setFichas] = useState([]);
  const [form, setForm] = useState(() => searchParams.get('tipo') === 'insumo' ? { ...vazio, tipo: 'insumo', categoria: 'Insumos' } : vazio);
  const [editing, setEditing] = useState(null);
  const [filtroTexto, setFiltroTexto] = useState('');
  const [filtroTipo, setFiltroTipo] = useState('Todos');
  const [filtroCategoria, setFiltroCategoria] = useState('Todos');
  const [filtroFicha, setFiltroFicha] = useState('Todos');
  const { showToast } = useToast();
  const fichaProduto = fichas.find((ficha) => String(ficha.produtoId?._id || ficha.produtoId) === String(editing?._id));
  const calculoDireto = form.tipo === 'insumo' || (form.tipo === 'venda' && form.tipoProduto === 'revenda');
  const precoCompraAtual = Number(form.precoCompra);
  const conteudoAtual = Number(form.conteudoPorEmbalagem);
  const custoCompraAtual = calculoDireto && precoCompraAtual > 0 && conteudoAtual > 0 ? precoCompraAtual / conteudoAtual : null;
  const custoPersistido = form.fonteCalculo === 'insumo' && Number.isFinite(Number(form.custoCalculado)) ? Number(form.custoCalculado) : null;
  const custoExibido = calculoDireto ? custoCompraAtual : custoPersistido;
  const custoDisponivel = custoExibido !== null;
  const precoVendaDisponivel = form.tipo === 'venda' && Number(form.preco) > 0;
  const lucroDisponivel = custoDisponivel && precoVendaDisponivel;
  const lucro = lucroDisponivel ? Number(form.preco) - Number(custoExibido) : null;
  const margem = lucroDisponivel && Number(form.preco) > 0 ? (lucro / Number(form.preco)) * 100 : null;
  const dinheiro = (valor) => Number(valor).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const dataCusto = form.dataUltimoCalculo ? new Date(form.dataUltimoCalculo) : null;
  const custoAtualizadoEm = dataCusto && !Number.isNaN(dataCusto.getTime())
    ? dataCusto.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
    : null;

  const carregar = async () => {
    const [productsResponse, recipesResponse] = await Promise.all([api.get('/products'), api.get('/production/recipes')]);
    setProdutos(productsResponse.data);
    setFichas(recipesResponse.data || []);
  };

  useEffect(() => {
    const carregarInicial = async () => { await carregar(); };
    carregarInicial();
  }, []);

  const tipoSolicitado = searchParams.get('tipo');
  const contextoFormulario = `${tipoSolicitado || ''}:${editing?._id || ''}`;
  const [contextoAnterior, setContextoAnterior] = useState(contextoFormulario);
  if (contextoAnterior !== contextoFormulario) {
    setContextoAnterior(contextoFormulario);
    if (tipoSolicitado === 'insumo' && !editing) {
      setForm((prev) => ({ ...prev, tipo: 'insumo', categoria: 'Insumos' }));
    }
  }

  useEffect(() => {
    if (!editing && produtos.length > 0) {
      const maiorCodigo = produtos.reduce((maior, atual) => {
        const codigo = Number(atual.codigo) || 0;
        return codigo > maior ? codigo : maior;
      }, 0);
      queueMicrotask(() => setForm((prev) => ({ ...prev, codigo: String(maiorCodigo + 1) })));
    }
  }, [produtos, editing]);

  const codigoJaExiste = (codigo, idEdicao = null) => produtos.some((produto) => String(produto.codigo) === String(codigo) && produto._id !== idEdicao);

  const limparCampoNumerico = (valor) => {
    if (valor === '' || valor === null || valor === undefined) return undefined;
    const num = Number(valor);
    if (num < 0) return undefined;
    return num;
  };


  const resumoInsumo = form.tipo === 'insumo' ? (() => {
    const unidade = form.unidade || form.unidadeCompra || 'kg';
    const conteudo = Number(form.conteudoPorEmbalagem) || 0;
    const embalagens = Number(form.estoqueEmbalagens) || 0;
    const aberto = Number(form.estoqueConteudoAberto) || 0;
    const fatores = { kg: 1, L: 1, un: 1 };
    const fator = fatores[unidade] || 1;
    const conteudoBase = conteudo * fator;
    const totalBase = (embalagens * conteudoBase) + (aberto * fator);
    const precoCompra = Number(form.precoCompra) || 0;
    const custoBase = precoCompra > 0 && conteudoBase > 0 ? precoCompra / conteudoBase : 0;
    const ePeso = unidade === 'kg';
    const eVolume = unidade === 'L';
    const eUnidade = unidade === 'un';
    return {
      total: totalBase / fator,
      totalBase,
      unidadeConteudo: unidade,
      totalKg: ePeso ? totalBase / 1000 : undefined,
      custoUnitarioBase: custoBase,
      custoPorKg: ePeso ? custoBase : undefined,
      custoPor100g: undefined,
      custoPorGrama: undefined,
      custoPorLitro: eVolume ? custoBase : undefined,
      custoPor100ml: undefined,
      custoPorUnidade: eUnidade ? custoBase : undefined,
    };
  })() : null;

  const submit = async (event) => {
    event.preventDefault();
    const tipo = form.tipo;
    if (!form.nome || form.nome.trim() === '') {
      showToast('⚠️ O nome do produto é obrigatório.', 'warning');
      return;
    }
    if (editing) {
      const precoEdicao = Number(form.preco);
      if (Number.isNaN(precoEdicao) || precoEdicao < 0) {
        showToast('⚠️ O preço do produto deve ser um número maior ou igual a zero.', 'warning');
        return;
      }
    } else if (tipo === 'venda' && (!form.preco || Number(form.preco) <= 0)) {
      showToast('⚠️ O preço de venda é obrigatório para produtos à venda.', 'warning');
      return;
    }
    if (codigoJaExiste(form.codigo, editing?._id)) {
      showToast('⚠️ Código já cadastrado. Escolha outro.', 'warning');
      return;
    }

    if (tipo === 'venda') {
      const descontos = (form.descontosPorQuantidade || []).map((faixa) => ({ quantidadeMinima: Number(faixa.quantidadeMinima), precoUnitario: Number(faixa.precoUnitario), ativo: faixa.ativo !== false }));
      for (let indice = 0; indice < descontos.length; indice += 1) {
        const anterior = descontos[indice - 1];
        if (!Number.isInteger(descontos[indice].quantidadeMinima) || descontos[indice].quantidadeMinima < 1 || descontos[indice].precoUnitario < 0 || (anterior && (descontos[indice].quantidadeMinima <= anterior.quantidadeMinima || descontos[indice].precoUnitario >= anterior.precoUnitario))) {
          showToast('⚠️ As faixas devem ter quantidade crescente e preço decrescente.', 'warning');
          return;
        }
        if (descontos[indice].precoUnitario >= Number(form.preco || 0)) {
          showToast('⚠️ O preço promocional deve ser menor que o preço normal.', 'warning');
          return;
        }
      }
    }
    if (tipo === 'venda') {
      const gd = form.grupoDesconto;
      if (gd && gd.nome && gd.ativo !== false) {
        if (!Number.isInteger(Number(gd.quantidadeMinima)) || Number(gd.quantidadeMinima) < 1) {
          showToast('⚠️ Quantidade mínima do grupo deve ser um inteiro positivo.', 'warning');
          return;
        }
        if (Number(gd.precoPromocional) < 0) {
          showToast('⚠️ Preço promocional do grupo não pode ser negativo.', 'warning');
          return;
        }
        if (Number(gd.precoPromocional) >= Number(form.preco || 0)) {
          showToast('⚠️ O preço promocional do grupo deve ser menor que o preço normal.', 'warning');
          return;
        }
      }
    }
    if (tipo === 'insumo' || form.usavelEmReceita) {
      if (Number(form.conteudoPorEmbalagem || 0) <= 0) { showToast('⚠️ Conteúdo da embalagem deve ser maior que zero.', 'warning'); return; }
      if (tipo === 'insumo' && Number(form.estoqueEmbalagens || 0) < 0) { showToast('⚠️ Quantidade de embalagens não pode ser negativa.', 'warning'); return; }
      if (!editing && (tipo === 'insumo' || form.usavelEmReceita) && (!form.precoCompra || Number(form.precoCompra) <= 0)) { showToast('⚠️ Preço de compra é obrigatório para produtos usados em receitas.', 'warning'); return; }
    }
    const unidadeFormulario = form.unidade === 'l' ? 'L' : (units.includes(form.unidade) ? form.unidade : 'un');
    const unidadeCompraFormulario = form.unidadeCompra === 'l' ? 'L' : (units.includes(form.unidadeCompra) ? form.unidadeCompra : unidadeFormulario);
    const unidadeVendaFormulario = form.unidadeVenda === 'l' ? 'L' : (units.includes(form.unidadeVenda) ? form.unidadeVenda : 'un');
    const rendimentoInformado = Number(form.rendimentoPorUnidadeCompra);
    const rendimentoFormulario = Number.isFinite(rendimentoInformado) && rendimentoInformado > 0 ? rendimentoInformado : 1;
    const payload = {
      ...form,
      codigo: editing ? editing.codigo : form.codigo,
      tipo,
      unidade: unidadeFormulario,
      quantidade: limparCampoNumerico(form.conteudoPorEmbalagem) ?? 1,
      rendimento: rendimentoFormulario,
      tipoProduto: tipo === 'venda' ? form.tipoProduto : undefined,
      rendimentoPorReceita: tipo === 'venda' && form.tipoProduto === 'producao' ? Number(form.rendimentoPorReceita || 1) : 1,
      estoque: tipo === 'insumo' ? limparCampoNumerico(form.estoqueEmbalagens) ?? 0 : (form.aFazer ? 0 : limparCampoNumerico(form.estoque) ?? 0),
      estoqueInsumos: tipo === 'insumo' ? limparCampoNumerico(form.estoqueEmbalagens) ?? 0 : (form.usavelEmReceita ? limparCampoNumerico(form.estoqueInsumos) ?? 0 : undefined),
      estoqueEmbalagens: tipo === 'insumo' ? limparCampoNumerico(form.estoqueEmbalagens) ?? 0 : undefined,
      estoqueMinimoEmbalagens: tipo === 'insumo' ? limparCampoNumerico(form.estoqueMinimoEmbalagens) ?? 0 : undefined,
      conteudoPorEmbalagem: limparCampoNumerico(form.conteudoPorEmbalagem) ?? 0,
      estoqueConteudoAberto: tipo === 'insumo' ? limparCampoNumerico(form.estoqueConteudoAberto) ?? 0 : undefined,
      categoria: tipo === 'insumo' ? 'Insumos' : (form.categoria || 'Outros'),
      preco: tipo === 'venda' ? limparCampoNumerico(form.preco) : undefined,
      precoVenda: tipo === 'venda' ? limparCampoNumerico(form.preco) : undefined,
      descontosPorQuantidade: tipo === 'venda' ? form.descontosPorQuantidade : [],
      grupoDesconto: tipo === 'venda' && form.grupoDesconto?.nome ? {
        nome: String(form.grupoDesconto.nome).trim(),
        quantidadeMinima: Number(form.grupoDesconto.quantidadeMinima),
        precoPromocional: Number(form.grupoDesconto.precoPromocional),
        ativo: Boolean(form.grupoDesconto.ativo),
      } : undefined,
      precoCompra: limparCampoNumerico(form.precoCompra) ?? 0,
      custoUnitarioBase: calculoDireto && custoCompraAtual !== null ? custoCompraAtual : undefined,
      usavelEmReceita: tipo === 'insumo' || Boolean(form.usavelEmReceita),
      unidadeVenda: unidadeVendaFormulario,
      unidadeCompra: unidadeCompraFormulario,
      unidadeConteudo: unidadeFormulario,
      rendimentoPorUnidadeCompra: Number(form.rendimentoPorUnidadeCompra || 0),
      ativo: Boolean(form.ativo),
      permitirVendaSemInsumo: Boolean(form.permitirVendaSemInsumo),
      fichaTecnica: tipo === 'venda' && form.aFazer ? form.fichaTecnica.map((item) => ({ produtoId: item.produtoId?._id || item.produtoId, quantidade: Number(item.quantidade), unidade: item.unidade })) : [],
    };
    try {
      const salvar = (dados) => editing ? api.put(`/products/${editing._id}`, dados) : api.post('/products', dados);
      try {
        await salvar(payload);
      } catch (error) {
        const divergencia = error.response?.data?.divergencia;
        if (!editing || !error.response?.data?.requireConfirmation || !divergencia || !window.confirm(`${error.response.data.msg}\n\n${divergencia.mensagem}\n\nDeseja salvar mesmo assim?`)) throw error;
        await salvar({ ...payload, confirmarDivergenciaCusto: true });
      }
      showToast(editing ? '✅ Produto atualizado!' : '✅ Produto cadastrado!', 'success');
      setForm(vazio);
      setEditing(null);
      carregar();
    } catch (error) {
      const validationMessage = error.response?.data?.errors?.map((item) => `${item.path || 'campo'}: ${item.msg}`).join('; ');
      showToast(error.response?.data?.error || error.response?.data?.msg || validationMessage || '❌ Não foi possível salvar o produto', 'error');
    }
  };

  const editarProduto = (produto) => {
    setEditing(produto);
    const unidadesDiretas = units;
    const unidadeCompra = produto.unidadeCompra === 'l' ? 'L' : (produto.unidade || produto.unidadeCompra || 'kg');
    const isDireta = unidadesDiretas.includes(unidadeCompra);
    const conteudoPorEmbalagem = isDireta ? (Number(produto.conteudoPorEmbalagem) || 1) : (produto.conteudoPorEmbalagem ?? '');
    const unidadeConteudo = produto.unidade === 'l' ? 'L' : (produto.unidadeConteudo || (isDireta ? unidadeCompra : 'kg'));
    setForm({
      codigo: produto.codigo,
      nome: produto.nome,
      ncm: produto.ncm || '',
      marcaReferencia: produto.marcaReferencia || '',
      tipo: produto.tipo || (produto.controladoComoInsumo ? 'insumo' : 'venda'),
      usavelEmReceita: Boolean(produto.usavelEmReceita),
      categoria: produto.categoria || 'Bebidas Quentes',
      preco: produto.preco ?? '',
      descontosPorQuantidade: produto.descontosPorQuantidade || [],
      grupoDesconto: produto.grupoDesconto || { nome: '', quantidadeMinima: '', precoPromocional: '', ativo: false },
      precoCompra: produto.precoCompra ?? '',
      unidadeCompra: unidadeCompra,
      unidade: produto.unidade || unidadeCompra,
      conteudoPorEmbalagem: conteudoPorEmbalagem,
      unidadeConteudo: unidadeConteudo,
      estoqueEmbalagens: produto.estoqueEmbalagens ?? produto.estoqueInsumos ?? '',
      estoqueInsumos: produto.estoqueInsumos ?? '',
      estoqueConteudoAberto: produto.estoqueConteudoAberto ?? 0,
      estoqueMinimoEmbalagens: produto.estoqueMinimoEmbalagens ?? produto.estoqueMinimoInsumos ?? '',
      rendimentoPorUnidadeCompra: produto.rendimentoPorUnidadeCompra ?? '',
      custo: produto.custoUnitario ?? produto.custo ?? '',
      custoCalculado: produto.custoCalculado ?? null,
      dataUltimoCalculo: produto.dataUltimoCalculo || null,
      fonteCalculo: produto.fonteCalculo || 'indisponivel',
      estoque: produto.tipo === 'insumo' ? (produto.estoqueInsumos ?? '') : (produto.estoque ?? ''),
      unidadeVenda: produto.unidadeVenda || 'un',
      vendidoFracionado: Boolean(produto.vendidoFracionado),
      aFazer: Boolean(produto.aFazer),
      tipoProduto: produto.tipoProduto || (produto.aFazer ? 'coz' : produto.producaoPropria ? 'producao' : 'revenda'),
      rendimentoPorReceita: produto.rendimentoPorReceita || 1,
      fichaTecnica: produto.fichaTecnica || [],
      permitirVendaSemInsumo: Boolean(produto.permitirVendaSemInsumo),
      producaoPropria: Boolean(produto.producaoPropria),
      ativo: produto.ativo !== false,
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const remover = async (id) => {
    if (!window.confirm('Excluir este produto?')) return;
    try {
      await api.delete(`/products/${id}`);
      showToast('Produto removido', 'warning');
      carregar();
    } catch (error) {
      showToast(error.response?.data?.msg || 'Não foi possível excluir o produto', 'error');
    }
  };

  const cancelar = () => {
    setEditing(null);
    setForm(vazio);
  };

  const filtrados = produtos.filter((produto) => {
    const tipoOk = filtroTipo === 'Todos' || (filtroTipo === 'Estoque de Venda' ? produto.tipo === 'venda' : produto.tipo === 'insumo');
    const categoriaOk = filtroCategoria === 'Todos' || (produto.categoria === filtroCategoria);
    const possuiFicha = fichas.some((ficha) => String(ficha.produtoId?._id || ficha.produtoId) === String(produto._id));
    const fichaSelecionada = fichas.find((ficha) => String(ficha._id) === String(filtroFicha));
    const ingredientesDaFicha = new Set((fichaSelecionada?.ingredientes || []).map((item) => String(item.produtoId?._id || item.produtoId)));
    const fichaOk = filtroFicha === 'Todos'
      || (filtroFicha === 'Sem ficha' && !possuiFicha)
      || ingredientesDaFicha.has(String(produto._id));
    const textoOk = [produto.nome, produto.codigo].join(' ').toLowerCase().includes(filtroTexto.toLowerCase());
    return tipoOk && categoriaOk && fichaOk && textoOk;
  });

  return (
    <div>
      <div className="page-heading">
        <div>
          <h1>📦 Cadastro de Produtos</h1>
          <p>Produtos à venda e insumos ficam em grupos diferentes.</p>
        </div>
      </div>

      <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: 16, padding: 16, marginBottom: 16 }}>
        <h3 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 14px', color: 'var(--text-primary)' }}>{editing ? '✏️ Editar Produto' : '➕ Novo Produto'}</h3>
        <form onSubmit={submit}>
          <section className="product-form-section">
            <div className="product-section-title"><span>📋</span><div><strong>TIPO DE PRODUTO</strong><small>Escolha o grupo do estoque</small></div></div>
            <div className="product-form-grid">
              <div className="product-type-field">
                <span className="product-type-label">Tipo *</span>
                <div className="product-radio-group">
                  <label className="product-radio-option">
                    <input className="product-radio" type="radio" name="tipoProduto" value="revenda" checked={form.tipo === 'venda' && form.tipoProduto === 'revenda'} onChange={() => setForm({ ...form, tipo: 'venda', tipoProduto: 'revenda', categoria: 'Bebidas Quentes', aFazer: false, producaoPropria: false })} />
                      Revenda
                  </label>
                  <label className="product-radio-option">
                    <input className="product-radio" type="radio" name="tipoProduto" value="coz" checked={form.tipo === 'venda' && form.tipoProduto === 'coz'} onChange={() => setForm({ ...form, tipo: 'venda', tipoProduto: 'coz', categoria: 'Pratos na Hora', estoque: 0, aFazer: true, producaoPropria: false })} />
                      Coz — na hora
                    </label>
                    <label className="product-radio-option">
                      <input className="product-radio" type="radio" name="tipoProduto" value="producao" checked={form.tipo === 'venda' && form.tipoProduto === 'producao'} onChange={() => setForm({ ...form, tipo: 'venda', tipoProduto: 'producao', categoria: 'Outros', aFazer: false, producaoPropria: true })} />
                      Produção própria — lote
                    </label>
                    <label className="product-radio-option">
                      <input className="product-radio" type="radio" name="tipoProduto" value="insumo" checked={form.tipo === 'insumo'} onChange={() => setForm({ ...form, tipo: 'insumo', tipoProduto: 'revenda', categoria: 'Insumos', aFazer: false, producaoPropria: false })} />
                      Insumo / Matéria-prima
                  </label>
                </div>
              </div>
              <label>Código {editing && <small>(bloqueado)</small>}
                <input value={form.codigo} readOnly={Boolean(editing)} onChange={(event) => { if (!editing) setForm({ ...form, codigo: event.target.value }); }} style={{ background: editing ? 'var(--bg-tertiary)' : 'var(--input-bg)', cursor: editing ? 'not-allowed' : 'text' }} />
              </label>
              <label>Nome *
                <input value={form.nome} required onChange={(event) => setForm({ ...form, nome: event.target.value })} />
              </label>
              {form.tipo === 'venda' && <label>NCM <small>(opcional, padrão 21069090)</small>
                <input inputMode="numeric" maxLength={8} value={form.ncm} onChange={(event) => setForm({ ...form, ncm: event.target.value.replace(/\D/g, '').slice(0, 8) })} />
              </label>}
              {form.tipo === 'insumo' && <label>Marca/Referência <small>(opcional)</small>
                <input value={form.marcaReferencia} onChange={(event) => setForm({ ...form, marcaReferencia: event.target.value })} />
              </label>}
              {form.tipo === 'venda' ? (
                <label>Categoria
                  <select value={form.categoria} onChange={(event) => setForm({ ...form, categoria: event.target.value })}>
                    {categoriasVenda.map((categoria) => <option key={categoria} value={categoria}>{categoria}</option>)}
                  </select>
                </label>
              ) : (
                <label>Categoria
                  <select value={form.categoria} onChange={(event) => setForm({ ...form, categoria: event.target.value })}>
                    {['Insumos', ...categoriasVenda].map((categoria) => <option key={categoria} value={categoria}>{categoria}</option>)}
                  </select>
                </label>
              )}
            </div>
          </section>

          {form.tipo === 'venda' ? (
            <section className="product-form-section">
              <div className="product-section-title"><span>💰</span><div><strong>VENDA</strong><small>Dados do produto pronto</small></div></div>
              <div className="product-form-grid">
                <label>Preço de venda (R$) * <input type="number" step="0.01" min={0} value={form.preco} required onChange={(event) => setForm({ ...form, preco: event.target.value })} /></label>
                <div className="product-cost-summary" style={{ gridColumn: '1 / -1', border: '1px solid var(--border-light)', borderRadius: 10, padding: 14, background: 'var(--bg-secondary)' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 12 }}>
                    <div><small>Custo Unitário Base</small><strong style={{ display: 'block', color: custoDisponivel ? 'var(--text-primary)' : 'var(--text-secondary)' }}>{custoDisponivel ? dinheiro(custoExibido) : 'Indisponível'}</strong></div>
                    <div><small>Preço Venda</small><strong style={{ display: 'block' }}>{precoVendaDisponivel ? dinheiro(form.preco) : 'Indisponível'}</strong></div>
                    <div><small>Lucro R$</small><strong style={{ display: 'block', color: lucroDisponivel && lucro < 0 ? 'var(--error-bg)' : 'var(--text-primary)' }}>{lucroDisponivel ? dinheiro(lucro) : 'Indisponível'}</strong></div>
                    <div><small>Lucro %</small><strong style={{ display: 'block', color: lucroDisponivel && lucro < 0 ? 'var(--error-bg)' : 'var(--text-primary)' }}>{lucroDisponivel ? `${margem.toFixed(1)}%` : 'Indisponível'}</strong></div>
                  </div>
                  {!custoDisponivel && <small style={{ display: 'block', marginTop: 10, color: 'var(--text-secondary)' }}>{calculoDireto && conteudoAtual <= 0 ? 'Quantidade por embalagem deve ser maior que zero.' : calculoDireto ? 'Sem preço de compra.' : 'Sem ficha técnica ou custo calculado.'}</small>}
                  {custoAtualizadoEm && <small style={{ display: 'block', marginTop: 6, color: 'var(--text-secondary)' }}>Custo atualizado em {custoAtualizadoEm}</small>}
                  {lucroDisponivel && lucro < 0 && <strong style={{ display: 'block', marginTop: 8, color: 'var(--error-bg)' }}>⚠️ Lucro negativo! Revisar preço ou custo.</strong>}
                </div>
                {fichaProduto?.ingredientes?.length > 0 && (
                  <div style={{ gridColumn: '1 / -1', borderTop: '1px solid var(--border-light)', paddingTop: 10 }}>
                    <strong>Ficha técnica e custos</strong>
                    {fichaProduto.ingredientes.map((item, indice) => (
                      <div key={`${item.produtoId?._id || item.produtoId}-${indice}`} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginTop: 7, color: item.custoDisponivel ? 'var(--text-primary)' : 'var(--text-secondary)' }}>
                        <span>{item.custoDisponivel ? '✅' : '⚠️'} {item.produtoId?.nome || 'Insumo'} {item.quantidade} {item.unidade}</span>
                        <strong>{item.custoDisponivel ? dinheiro(item.custoItem) : 'Indisponível'}</strong>
                      </div>
                    ))}
                  </div>
                )}
                {form.tipoProduto === 'revenda' && (
                  <>
                    <label>Preço de compra (R$) <input type="number" step="0.01" min={0} value={form.precoCompra} onChange={(event) => setForm({ ...form, precoCompra: event.target.value })} /></label>
                    <label>Conteúdo por embalagem <input type="number" step="0.001" min={0} value={form.conteudoPorEmbalagem} onChange={(event) => setForm({ ...form, conteudoPorEmbalagem: event.target.value })} /><small>Quantidade de unidades/conteúdo comprada na embalagem.</small></label>
                  </>
                )}
                <label className="product-checkbox-label" style={{ gridColumn: '1 / -1' }}>
                  <input className="product-checkbox" type="checkbox" checked={Boolean(form.usavelEmReceita)} onChange={(event) => setForm({ ...form, usavelEmReceita: event.target.checked })} />
                  Também usar como ingrediente em fichas técnicas
                </label>
                {form.usavelEmReceita && <>
                  <label>Preço de compra (R$) * <input type="number" step="0.01" min={0.01} required value={form.precoCompra} onChange={(event) => setForm({ ...form, precoCompra: event.target.value })} /></label>
                  <label>Conteúdo por embalagem * <input type="number" step="0.001" min={0.001} required value={form.conteudoPorEmbalagem} onChange={(event) => setForm({ ...form, conteudoPorEmbalagem: event.target.value })} /></label>
                  <label>Unidade do conteúdo
                    <select value={form.unidade} onChange={(event) => setForm({ ...form, unidade: event.target.value, unidadeCompra: event.target.value, unidadeConteudo: event.target.value })}>{units.map((unidade) => <option key={unidade}>{unidade}</option>)}</select>
                  </label>
                </>}
                <div style={{ gridColumn: '1 / -1', marginTop: 4, padding: 14, border: '1px solid var(--border-light)', borderRadius: 10, background: 'var(--bg-tertiary)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                    <strong>🏷️ Desconto por Quantidade <small>(opcional)</small></strong>
                    <button type="button" onClick={() => setForm({ ...form, descontosPorQuantidade: [...(form.descontosPorQuantidade || []), { quantidadeMinima: '', precoUnitario: '', ativo: true }] })} style={{ border: '1px solid var(--accent-border)', borderRadius: 8, padding: '7px 10px', background: 'var(--accent-light)', color: 'var(--accent-primary)', fontWeight: 700, cursor: 'pointer' }}>+ Adicionar faixa</button>
                  </div>
                  {(form.descontosPorQuantidade || []).map((faixa, indice) => (
                    <div className="quantity-discount-row" key={`desconto-${indice}`} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 8, alignItems: 'end', marginTop: 8 }}>
                      <label>A partir de <input type="number" min={1} step={1} value={faixa.quantidadeMinima} onChange={(event) => setForm({ ...form, descontosPorQuantidade: form.descontosPorQuantidade.map((item, itemIndex) => itemIndex === indice ? { ...item, quantidadeMinima: event.target.value } : item) })} /></label>
                      <label>Preço unitário (R$) <input type="number" min={0} step="0.01" value={faixa.precoUnitario} onChange={(event) => setForm({ ...form, descontosPorQuantidade: form.descontosPorQuantidade.map((item, itemIndex) => itemIndex === indice ? { ...item, precoUnitario: event.target.value } : item) })} /></label>
                      <button type="button" onClick={() => setForm({ ...form, descontosPorQuantidade: form.descontosPorQuantidade.filter((_, itemIndex) => itemIndex !== indice) })} style={{ minHeight: 38, border: '1px solid rgba(220,38,38,.2)', borderRadius: 8, background: 'rgba(220,38,38,.08)', color: 'var(--error-bg)', cursor: 'pointer' }}>Remover</button>
                    </div>
                  ))}
                  {!form.descontosPorQuantidade?.length && <small style={{ color: 'var(--text-secondary)' }}>Nenhuma faixa promocional cadastrada.</small>}
                </div>
                <div style={{ gridColumn: '1 / -1', marginTop: 4, padding: 14, border: '1px solid var(--border-light)', borderRadius: 10, background: 'var(--bg-tertiary)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                    <strong>🎯 Desconto por Grupo (Categoria) <small>(opcional)</small></strong>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'var(--text-secondary)' }}>
                      <input type="checkbox" checked={Boolean(form.grupoDesconto?.ativo)} onChange={(e) => setForm({ ...form, grupoDesconto: { ...(form.grupoDesconto || { nome: '', quantidadeMinima: '', precoPromocional: '', ativo: false }), ativo: e.target.checked } })} />
                      Ativo
                    </label>
                  </div>
                  <p style={{ fontSize: 11, color: 'var(--text-secondary)', margin: '0 0 8px', lineHeight: 1.4 }}>
                    Produtos com o <strong>mesmo nome de grupo</strong> e <strong>mesma categoria</strong> somam as quantidades. Quando o total atingir a quantidade mínima, todos ganham o preço promocional.
                  </p>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                    <label>Nome do grupo <input type="text" placeholder="ex: Cookies" value={form.grupoDesconto?.nome || ''} onChange={(e) => setForm({ ...form, grupoDesconto: { ...(form.grupoDesconto || { quantidadeMinima: '', precoPromocional: '', ativo: false }), nome: e.target.value } })} /></label>
                    <label>Quantidade mínima <input type="number" min={1} step={1} value={form.grupoDesconto?.quantidadeMinima || ''} onChange={(e) => setForm({ ...form, grupoDesconto: { ...(form.grupoDesconto || { nome: '', precoPromocional: '', ativo: false }), quantidadeMinima: e.target.value } })} /></label>
                    <label>Preço promocional (R$) <input type="number" min={0} step="0.01" value={form.grupoDesconto?.precoPromocional || ''} onChange={(e) => setForm({ ...form, grupoDesconto: { ...(form.grupoDesconto || { nome: '', quantidadeMinima: '', ativo: false }), precoPromocional: e.target.value } })} /></label>
                  </div>
                  {form.grupoDesconto?.nome && <small style={{ color: 'var(--success-bg)', fontSize: 11, marginTop: 6, display: 'block' }}>✓ Produtos com grupo "{form.grupoDesconto.nome}" vão somar para este desconto.</small>}
                </div>
                {form.tipoProduto === 'producao' && <label>Rendimento por ficha técnica *<input required type="number" min="0.001" step="0.001" value={form.rendimentoPorReceita || 1} onChange={(event) => setForm({ ...form, rendimentoPorReceita: event.target.value })} /><small>Quantas unidades saem de uma fornada.</small></label>}
                {form.tipoProduto !== 'coz' ? <label>Estoque atual <input type="number" step="0.001" min={0} value={form.estoque} onChange={(event) => setForm({ ...form, estoque: event.target.value })} /></label> : <div className="coz-stock-notice"><strong>⚠️ Coz não possui estoque próprio</strong><span>Disponibilidade calculada pela ficha técnica e pelos insumos disponíveis.</span></div>}
                {form.usavelEmReceita && <label>Estoque de insumos <small>Para uso em receitas</small><input type="number" step="0.001" min={0} value={form.estoqueInsumos} onChange={(event) => setForm({ ...form, estoqueInsumos: event.target.value })} /></label>}
                <label>Unidade de compra
                  <select value={form.unidadeCompra} onChange={(event) => setForm({ ...form, unidade: event.target.value, unidadeCompra: event.target.value, unidadeConteudo: event.target.value })}>
                    {units.map((unidade) => <option key={unidade} value={unidade}>{unidade}</option>)}
                  </select>
                </label>
                <label>Unidade de venda
                  <select value={form.unidadeVenda} onChange={(event) => setForm({ ...form, unidadeVenda: event.target.value })}>
                    {units.map((unidade) => <option key={unidade} value={unidade}>{unidade}</option>)}
                  </select>
                </label>
                <label className="product-checkbox-label">
                  <input className="product-checkbox" type="checkbox" checked={form.vendidoFracionado} onChange={(event) => setForm({ ...form, vendidoFracionado: event.target.checked })} />
                  Permitir venda fracionada
                </label>
                <label className="product-checkbox-label">
                  <input className="product-checkbox" type="checkbox" checked={form.ativo} onChange={(event) => setForm({ ...form, ativo: event.target.checked })} />
                  Produto ativo
                </label>
                {form.tipoProduto === 'coz' && <div className="coz-recipe-panel"><strong>📋 Ficha técnica vinculada</strong>{fichaProduto ? <><span>Custo/unidade: <b>{`R$ ${Number(fichaProduto.custoPorUnidade || 0).toFixed(2).replace('.', ',')}`}</b></span><span>Disponível: <b>{Number(fichaProduto.disponibilidade?.quantidade || 0)} {fichaProduto.unidadeRendimento}</b></span><small>Ingrediente limitante: {fichaProduto.disponibilidade?.limitante || 'nenhum'}</small></> : <span>Este produto ainda não tem ficha técnica. Crie-a em Produção para liberar a disponibilidade.</span>}<Link className="coz-recipe-link" to={`/producao/fichas?produto=${editing?._id || ''}`}>{fichaProduto ? 'Editar ficha técnica →' : 'Criar ficha técnica →'}</Link></div>}
                {form.tipoProduto === 'producao' && <div className="coz-recipe-panel"><strong>📋 Ficha técnica vinculada</strong><span>Este produto é produzido internamente e usa uma ficha técnica para controlar o custo e o rendimento.</span><Link className="coz-recipe-link" to={`/producao/fichas?produto=${editing?._id || ''}`}>Gerenciar ficha técnica →</Link></div>}
              </div>
            </section>
          ) : (
            <>
            <section className="product-form-section">
              <div className="product-section-title"><span>💰</span><div><strong>COMPRA</strong><small>Preço, conteúdo e quantidade de embalagens</small></div></div>
              <div className="product-form-grid">
                <label>Preço de compra POR EMBALAGEM (R$) * <input type="number" step="0.01" min={0} value={form.precoCompra} required onChange={(event) => setForm({ ...form, precoCompra: event.target.value })} /></label>
                <label>Tipo de embalagem * <small>Unidade em que você compra</small>
                  <select value={form.unidadeCompra} onChange={(event) => {
                    setForm({ ...form, unidade: event.target.value, unidadeCompra: event.target.value, conteudoPorEmbalagem: 1, unidadeConteudo: event.target.value });
                  }}>
                    {units.map((unidade) => <option key={unidade} value={unidade}>{unidade}</option>)}
                  </select>
                </label>
                <label>Conteúdo da embalagem * <small>Quanto tem dentro de cada embalagem</small>
                   <div className="product-input-with-unit"><input type="number" step={decimalStep(form.unidade)} min={decimalMinimum(form.unidade)} required value={form.conteudoPorEmbalagem} onChange={(event) => setForm({ ...form, quantidade: event.target.value, conteudoPorEmbalagem: event.target.value })} /><select value={form.unidade} onChange={(event) => setForm({ ...form, unidade: event.target.value, unidadeCompra: event.target.value, unidadeConteudo: event.target.value })}>{units.map((unidade) => <option key={unidade}>{unidade}</option>)}</select></div>
                </label>
                <label>Quantidade de embalagens em estoque * <input type="number" step="0.001" min={0} value={form.estoqueEmbalagens} required onChange={(event) => setForm({ ...form, estoqueEmbalagens: event.target.value })} /></label>
                <label>Estoque mínimo ({form.unidadeConteudo}) <small>Mínimo em unidade de conteúdo</small><input type="number" step="0.001" min={0} value={form.estoqueMinimoEmbalagens} onChange={(event) => setForm({ ...form, estoqueMinimoEmbalagens: event.target.value })} /></label>
              </div>
            </section>
            <section className="product-form-section product-summary-section">
              <div className="product-section-title"><span>📊</span><div><strong>RESUMO AUTOMÁTICO</strong><small>Calculado — nenhuma conta manual</small></div></div>
              <div className="product-summary-grid">
                <div><span>Estoque total</span><strong>{(resumoInsumo?.total || 0).toLocaleString('pt-BR', { maximumFractionDigits: 3 })} {resumoInsumo?.unidadeConteudo || form.unidadeCompra}</strong></div>
                <div><span>Custo por kg</span><strong>R$ {(resumoInsumo?.custoPorKg || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></div>
                <div><span>Custo por 100g</span><strong>R$ {(resumoInsumo?.custoPor100g || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></div>
                <div><span>Custo por grama</span><strong>R$ {(resumoInsumo?.custoPorGrama || 0).toLocaleString('pt-BR', { minimumFractionDigits: 6, maximumFractionDigits: 6 })}</strong></div>
                <div><span>Custo por unidade base</span><strong>R$ {(resumoInsumo?.custoUnitarioBase || 0).toLocaleString('pt-BR', { minimumFractionDigits: 6, maximumFractionDigits: 6 })} / {resumoInsumo?.unidadeConteudo || form.unidadeCompra}</strong></div>
                {resumoInsumo?.esgotado && <div><span style={{ color: 'var(--error-bg)' }}>⚠️ Estoque esgotado!</span></div>}
                {resumoInsumo?.abaixoMinimo && <div><span style={{ color: 'var(--warning-bg)' }}>⚠️ Abaixo do mínimo!</span></div>}
              </div>
            </section>
            </>
          )}

          <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
            <button type="submit" style={{ flex: 1, minHeight: 46, borderRadius: 10, background: 'var(--accent-primary)', color: '#fff', border: 'none', fontWeight: 700, cursor: 'pointer' }}>
              {editing ? 'Atualizar' : 'Cadastrar'}
            </button>
            {editing && (
              <button type="button" onClick={cancelar} style={{ minHeight: 46, borderRadius: 10, padding: '0 18px', background: 'var(--bg-tertiary)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', fontWeight: 700, cursor: 'pointer' }}>
                Cancelar
              </button>
            )}
          </div>
        </form>
      </div>

      <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: 16, padding: 16 }}>
        <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 10 }}>
          {filtrosTipo.map((tipo) => (
            <button key={tipo} type="button" onClick={() => setFiltroTipo(tipo)} style={{ flexShrink: 0, minHeight: 40, padding: '8px 13px', borderRadius: 20, border: filtroTipo === tipo ? '1px solid var(--accent-primary)' : '1px solid var(--border-color)', background: filtroTipo === tipo ? 'var(--accent-primary)' : 'var(--bg-tertiary)', color: filtroTipo === tipo ? '#fff' : 'var(--text-secondary)', fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>
              {tipo}
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap', margin: '14px 0 10px' }}>
          <h3 style={{ fontSize: 15, fontWeight: 700, margin: 0 }}>Produtos</h3>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>

              <select className="product-filter-select" value={filtroFicha} onChange={(event) => setFiltroFicha(event.target.value)} aria-label="Selecionar ficha técnica" style={{ minHeight: 40, borderRadius: 10, border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-primary)', padding: '8px 10px' }}>
              <option value="Todos">Por Ficha técnica</option>
              {fichas.map((ficha) => <option key={ficha._id} value={ficha._id}>{ficha.produtoId?.nome || ficha.nome}</option>)}
              </select>

              <select className="product-filter-select" value={filtroCategoria} onChange={(event) => setFiltroCategoria(event.target.value)} style={{ minHeight: 40, borderRadius: 10, border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-primary)', padding: '8px 10px' }}>
              <option value="Todos">Todas as categorias</option>
              {categoriasVenda.map((categoria) => <option key={categoria} value={categoria}>{categoria}</option>)}
            </select>
            <input value={filtroTexto} onChange={(event) => setFiltroTexto(event.target.value)} placeholder="Filtrar..." style={{ minHeight: 40, borderRadius: 10, border: '1px solid var(--border-color)', background: 'var(--bg-tertiary)', color: 'var(--text-primary)', padding: '8px 10px', minWidth: 180 }} />
          </div>
        </div>

        {filtrados.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 36, color: 'var(--text-secondary)', fontSize: 13 }}>Nenhum produto nesta visão</div>
        ) : (
          <div className="product-admin-grid">
            {filtrados.map((produto) => (
              <article key={produto._id} className="product-admin-card">
                <div>
                  <span style={{ background: produto.tipo === 'insumo' ? 'var(--category-supply-bg)' : 'var(--category-hot-bg)', color: produto.tipo === 'insumo' ? 'var(--category-supply-text)' : 'var(--category-hot-text)', padding: '3px 9px', borderRadius: 20, fontSize: 10, fontWeight: 700 }}>
                    {produto.tipo === 'insumo' ? 'INSUMO' : 'VENDA'}
                  </span>
                  <h4>{produto.nome}</h4>
                  <span className="product-code">Código {produto.codigo}</span>
                </div>
                <div className="product-admin-footer">
                  <div>
                    {produto.tipo === 'insumo' ? (() => {
                      const unidadeConteudo = produto.unidadeConteudo || 'un';
                      const unidadeCompra = produto.unidade || produto.unidadeCompra || 'un';
                      const precoCompra = Number(produto.precoCompra ?? produto.resumoInsumo?.precoPorEmbalagem ?? 0);
                      const conteudoPorEmbalagem = Number(produto.conteudoPorEmbalagem ?? produto.resumoInsumo?.conteudoPorEmbalagem ?? 1);
                      const custoUnitarioBase = Number(produto.custoUnitarioBase ?? produto.resumoInsumo?.custoUnitarioBase ?? (precoCompra && conteudoPorEmbalagem ? (precoCompra / conteudoPorEmbalagem) : 0));
                      const quantidadeDisponivel = Number(produto.estoqueInsumosTotal ?? produto.resumoInsumo?.total ?? ((Number(produto.estoqueInsumos ?? produto.estoqueEmbalagens ?? 0) * conteudoPorEmbalagem) || 0));

                      return (
                        <>
                          <strong>R$ {precoCompra.toFixed(2).replace('.', ',')}</strong>
                          <small>COMPRA · {unidadeCompra}</small>
                          <small className={produto.resumoInsumo?.abaixoMinimo || produto.resumoInsumo?.esgotado ? 'low-stock' : ''}>
                            {quantidadeDisponivel.toLocaleString('pt-BR', { maximumFractionDigits: 3 })} {unidadeConteudo} disponíveis
                          </small>
                          <small>Compra: R$ {precoCompra.toFixed(2).replace('.', ',')}/{unidadeCompra}</small>
                          <small>Contém: {conteudoPorEmbalagem.toLocaleString('pt-BR', { maximumFractionDigits: 3 })} {unidadeConteudo} por {unidadeCompra}</small>
                          <small>Custo: R$ {custoUnitarioBase.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}/{unidadeConteudo}</small>
                        </>
                      );
                    })() : (() => {
                      const preco = Number(produto.preco || 0);
                      const custoDireto = produto.precoCompra > 0 && Number(produto.conteudoPorEmbalagem || 0) > 0
                        ? Number(produto.precoCompra) / Number(produto.conteudoPorEmbalagem)
                        : null;
                      const custoCalculado = produto.fonteCalculo === 'insumo' && Number.isFinite(Number(produto.custoCalculado))
                        ? Number(produto.custoCalculado)
                        : null;
                      const custo = custoCalculado ?? custoDireto;
                      const custoDisponivel = custo !== null;
                      const lucroProduto = custoDisponivel && preco > 0 ? preco - custo : null;
                      return (
                        <>
                          <strong>R$ {preco.toFixed(2).replace('.', ',')}</strong>
                          <small>{`Categoria: ${produto.categoria}`}</small>
                          <small className={Number(produto.estoque || 0) <= 5 ? 'low-stock' : ''}>{(Number(produto.estoque) || 0).toLocaleString('pt-BR', { maximumFractionDigits: 3 })} em estoque</small>
                          <small style={{ color: custoDisponivel ? 'var(--text-primary)' : 'var(--text-secondary)' }}>Custo: {custoDisponivel ? dinheiro(custo) : 'Indisponível'}</small>
                          <small style={{ color: lucroProduto !== null && lucroProduto < 0 ? 'var(--error-bg)' : 'var(--text-secondary)' }}>Lucro: {lucroProduto !== null ? `${dinheiro(lucroProduto)} (${((lucroProduto / preco) * 100).toFixed(1)}%)` : 'Indisponível'}</small>
                        </>
                      );
                    })()}
                  </div>
                  <div className="product-card-actions">
                    <button type="button" onClick={() => editarProduto(produto)} style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border-color)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', cursor: 'pointer' }}>Editar</button>
                    <button type="button" onClick={() => remover(produto._id)} style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid rgba(239,68,68,0.25)', background: 'rgba(239,68,68,0.1)', color: 'var(--error-bg)', cursor: 'pointer' }}>Excluir</button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>

      <style>{`
        .product-form-section { display: grid; gap: 14px; margin-top: 14px; padding: 16px; border: 1px solid var(--border-light); border-radius: 12px; background: var(--bg-tertiary); }
        .product-filter-select { background-color: var(--bg-tertiary) !important; color: var(--text-primary) !important; color-scheme: normal; }
        .product-filter-select option { background: var(--bg-secondary); color: var(--text-primary); }
        .product-section-title { display: flex; align-items: center; gap: 9px; padding-bottom: 10px; border-bottom: 1px solid var(--border-light); }
        .product-section-title > span { font-size: 17px; }
        .product-section-title div { display: grid; gap: 3px; }
        .product-section-title strong { color: var(--text-primary); font-size: 11px; letter-spacing: .06em; }
        .product-section-title small { color: var(--text-secondary); font-size: 11px; }
        .product-form-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; align-items: start; }
        .product-form-section label {
          display: flex;
          flex-direction: column;
          justify-content: flex-start;
          gap: 6px;
          color: var(--text-secondary);
          font-size: 12px;
          font-weight: 700;
          min-height: 100%;
        }
        .product-form-section input, .product-form-section select {
          width: 100%;
          box-sizing: border-box;
          height: 42px;
          min-height: 42px;
          padding: 9px 11px;
          border: 1px solid var(--border-color);
          border-radius: 8px;
          background: var(--input-bg);
          color: var(--input-text);
          font: inherit;
          line-height: 1.2;
          margin: 0;
        }
        .product-input-with-unit { display: grid; grid-template-columns: minmax(0, 1fr) 76px; gap: 8px; align-items: stretch; }
        .product-input-with-unit input, .product-input-with-unit select { height: 42px; }
        .product-summary-section { background: var(--bg-secondary); }
        .product-summary-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 10px; }
        .product-summary-grid div { display: grid; gap: 4px; padding: 12px; border: 1px solid var(--border-light); border-radius: 9px; }
        .product-summary-grid span { color: var(--text-secondary); font-size: 11px; }
        .product-summary-grid strong { color: var(--text-primary); font-size: 14px; }
        .product-type-field { display: flex; flex-direction: column; gap: 6px; color: var(--text-secondary); font-size: 12px; font-weight: 700; }
        .product-type-label { display: block; }
        .product-radio-group { display: flex; align-items: center; gap: 18px; min-height: 42px; flex-wrap: wrap; padding: 2px 0; }
        .product-form-section .product-radio-option { display: inline-flex; align-items: center; gap: 8px; min-height: 32px; color: var(--text-primary); font-weight: 600; cursor: pointer; margin: 0; }
        .product-form-section .product-radio { width: 16px; height: 16px; min-width: 16px; min-height: 16px; margin: 0; padding: 0; accent-color: var(--accent-primary); }
        .product-form-section .product-checkbox-label { display: flex; align-items: center; gap: 10px; min-height: 42px; }
        .product-form-section .product-checkbox { width: 18px; height: 18px; min-width: 18px; min-height: 18px; margin: 0; padding: 0; accent-color: var(--accent-primary); }
        .product-admin-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 12px; }
        .product-admin-card { min-height: 170px; display: flex; flex-direction: column; padding: 14px; border: 1px solid var(--border-color); border-radius: 14px; background: var(--bg-tertiary); }
        .product-admin-card h4 { margin: 12px 0 4px; color: var(--text-primary); font-size: 14px; }
        .product-code { color: var(--text-secondary); font-family: monospace; font-size: 11px; }
        .product-admin-footer { display: flex; flex-direction: column; align-items: stretch; gap: 10px; margin-top: auto; padding-top: 16px; }
        .product-card-actions { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 6px; }
        .product-admin-footer strong { display: block; color: var(--accent-primary); font-size: 17px; }
        .product-admin-footer small { display: block; color: var(--text-secondary); font-size: 11px; margin-top: 3px; }
        .low-stock { color: var(--error-bg) !important; font-weight: 700; }
        .coz-stock-notice { display: grid; gap: 5px; grid-column: 1 / -1; padding: 12px; border: 1px solid var(--accent-border); border-radius: 10px; background: var(--accent-light); color: var(--accent-primary); font-size: 12px; }
        .coz-stock-notice span { color: var(--text-secondary); }
        .coz-recipe-panel { display: grid; gap: 12px; grid-column: 1 / -1; padding: 14px; border: 1px solid var(--accent-border); border-radius: 12px; background: var(--bg-secondary); }
        .coz-recipe-panel > span, .coz-recipe-panel > small { color: var(--text-secondary); font-size: 12px; }
        .coz-recipe-panel b { color: var(--accent-primary); }
        .coz-recipe-link { width: fit-content; color: var(--accent-primary); font-size: 12px; font-weight: 800; }
        .coz-recipe-heading { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
        .coz-recipe-heading div { display: grid; gap: 4px; }
        .coz-recipe-heading strong { color: var(--accent-primary); font-size: 12px; }
        .coz-recipe-heading small, .coz-empty-recipe { color: var(--text-secondary); font-size: 11px; }
        .coz-recipe-fields { display: grid; gap: 8px; }
        .coz-ingredient-row { display: grid; grid-template-columns: minmax(0, 1.5fr) minmax(100px, .8fr) 90px auto; gap: 8px; align-items: end; padding: 10px; border: 1px solid var(--border-light); border-radius: 9px; background: var(--bg-tertiary); }
        .coz-recipe-summary { display: flex; flex-wrap: wrap; gap: 12px; padding-top: 10px; border-top: 1px solid var(--border-light); color: var(--text-secondary); font-size: 12px; }
        .coz-recipe-summary strong { color: var(--text-primary); }
        .coz-warning { color: var(--error-bg); font-weight: 700; }
        @media (max-width: 640px) { .product-form-grid, .product-summary-grid { grid-template-columns: 1fr; } .coz-recipe-heading { align-items: flex-start; flex-direction: column; } .coz-ingredient-row { grid-template-columns: 1fr; } .coz-ingredient-row .danger { width: 100%; } }
      `}</style>
    </div>
  );
}

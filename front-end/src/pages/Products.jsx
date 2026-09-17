import { useState, useEffect } from 'react';
import api from '../services/api.jsx';
import { useToast } from '../components/Toast.jsx';

const categoriasVenda = ['Bebidas Quentes', 'Bebidas geladas', 'Salgados', 'Doces', 'Congelados', 'Sorvetes', 'Outros'];
const filtrosTipo = ['Todos', 'Estoque de Venda', 'Estoque de Insumos'];

const vazio = {
  codigo: '',
  nome: '',
  marcaReferencia: '',
  tipo: 'venda',
  categoria: 'Bebidas Quentes',
  preco: '',
  precoCompra: '',
  unidadeCompra: 'kg',
  conteudoPorEmbalagem: 1,
  unidadeConteudo: 'kg',
  estoqueEmbalagens: '',
  estoqueConteudoAberto: 0,
  estoqueMinimoEmbalagens: '',
  rendimentoPorUnidadeCompra: '',
  custo: '',
  estoque: '',
  unidadeVenda: 'un',
  vendidoFracionado: false,
  aFazer: false,
  fichaTecnica: [],
  producaoPropria: false,
};

export default function Products() {
  const [produtos, setProdutos] = useState([]);
  const [form, setForm] = useState(vazio);
  const [editing, setEditing] = useState(null);
  const [filtroTexto, setFiltroTexto] = useState('');
  const [filtroTipo, setFiltroTipo] = useState('Todos');
  const [filtroCategoria, setFiltroCategoria] = useState('Todos');
  const { showToast } = useToast();
  const editingInsumo = Boolean(editing?.tipo === 'insumo');

  const carregar = async () => {
    const res = await api.get('/products');
    setProdutos(res.data);
  };

  useEffect(() => {
    const carregarInicial = async () => { await carregar(); };
    carregarInicial();
  }, []);

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
    return Number(valor);
  };

  const resumoInsumo = form.tipo === 'insumo' ? (() => {
    const unidadesDiretas = ['kg', 'g', 'mg', 'l', 'ml', 'un'];
    const unidade = unidadesDiretas.includes(form.unidadeCompra) ? form.unidadeCompra : form.unidadeConteudo;
    const conteudo = Number(form.conteudoPorEmbalagem) || 0;
    const embalagens = Number(form.estoqueEmbalagens) || 0;
    const aberto = Number(form.estoqueConteudoAberto) || 0;
    const fatores = { mg: 0.001, g: 1, kg: 1000, ml: 1, l: 1000, un: 1 };
    const fator = fatores[unidade] || 1;
    const conteudoBase = conteudo * fator;
    const totalBase = (embalagens * conteudoBase) + (aberto * fator);
    const precoCompra = Number(form.precoCompra) || 0;
    const custoBase = precoCompra > 0 && conteudoBase > 0 ? precoCompra / conteudoBase : 0;
    const ePeso = ['g', 'kg', 'mg'].includes(unidade);
    const eVolume = ['l', 'ml'].includes(unidade);
    const eUnidade = unidade === 'un';
    return {
      total: totalBase / fator,
      totalBase,
      unidadeConteudo: unidade,
      totalKg: ePeso ? totalBase / 1000 : undefined,
      custoUnitarioBase: custoBase,
      custoPorKg: ePeso ? custoBase * 1000 : undefined,
      custoPor100g: ePeso ? custoBase * 100 : undefined,
      custoPorGrama: ePeso ? custoBase : undefined,
      custoPorLitro: eVolume ? custoBase * 1000 : undefined,
      custoPor100ml: eVolume ? custoBase * 100 : undefined,
      custoPorUnidade: eUnidade ? custoBase : undefined,
    };
  })() : null;

  const submit = async (event) => {
    event.preventDefault();
    if (codigoJaExiste(form.codigo, editing?._id)) {
      showToast('⚠️ Código já cadastrado. Escolha outro.', 'warning');
      return;
    }

    const tipo = form.tipo;
    if (tipo === 'insumo') {
      if (Number(form.precoCompra || 0) <= 0) { showToast('⚠️ Preço de compra por embalagem deve ser maior que zero.', 'warning'); return; }
      if (Number(form.conteudoPorEmbalagem || 0) <= 0) { showToast('⚠️ Conteúdo da embalagem deve ser maior que zero.', 'warning'); return; }
      if (Number(form.estoqueEmbalagens || 0) < 0) { showToast('⚠️ Quantidade de embalagens não pode ser negativa.', 'warning'); return; }
    }
    const payload = {
      ...form,
      tipo,
      estoque: tipo === 'insumo' ? limparCampoNumerico(form.estoqueEmbalagens) ?? 0 : limparCampoNumerico(form.estoque) ?? 0,
      estoqueEmbalagens: tipo === 'insumo' ? limparCampoNumerico(form.estoqueEmbalagens) ?? 0 : undefined,
      estoqueMinimoEmbalagens: tipo === 'insumo' ? limparCampoNumerico(form.estoqueMinimoEmbalagens) ?? 0 : undefined,
      conteudoPorEmbalagem: tipo === 'insumo' ? limparCampoNumerico(form.conteudoPorEmbalagem) ?? 0 : undefined,
      estoqueConteudoAberto: tipo === 'insumo' ? limparCampoNumerico(form.estoqueConteudoAberto) ?? 0 : undefined,
      categoria: tipo === 'insumo' ? 'Insumos' : (form.categoria || 'Outros'),
      preco: tipo === 'venda' ? limparCampoNumerico(form.preco) ?? 0 : 0,
      precoVenda: tipo === 'venda' ? limparCampoNumerico(form.preco) ?? 0 : 0,
      precoCompra: tipo === 'insumo' ? limparCampoNumerico(form.precoCompra) ?? 0 : 0,
      unidadeVenda: form.unidadeVenda || 'un',
      unidadeCompra: form.unidadeCompra || 'kg',
      custoUnitario: limparCampoNumerico(form.custo) ?? 0,
      custo: limparCampoNumerico(form.custo) ?? 0,
      rendimentoPorUnidadeCompra: 0,
      ativo: true,
    };
    if (editingInsumo) {
      delete payload.precoCompra;
      delete payload.custoUnitario;
      delete payload.custo;
      delete payload.conteudoPorEmbalagem;
      delete payload.unidadeConteudo;
      delete payload.unidadeCompra;
    }

    try {
      if (editing) await api.put(`/products/${editing._id}`, payload);
      else await api.post('/products', payload);
      showToast(editing ? '✅ Produto atualizado!' : '✅ Produto cadastrado!', 'success');
      setForm(vazio);
      setEditing(null);
      carregar();
    } catch (error) {
      const validationMessage = error.response?.data?.errors?.map((item) => item.msg).join('; ');
      showToast(error.response?.data?.error || error.response?.data?.msg || validationMessage || '❌ Não foi possível salvar o produto', 'error');
    }
  };

  const editarProduto = (produto) => {
    setEditing(produto);
    const unidadesDiretas = ['kg', 'g', 'mg', 'l', 'ml', 'un'];
    const unidadeCompra = produto.unidadeCompra || 'kg';
    const isDireta = unidadesDiretas.includes(unidadeCompra);
    const conteudoPorEmbalagem = isDireta ? (Number(produto.conteudoPorEmbalagem) || 1) : (produto.conteudoPorEmbalagem ?? '');
    const unidadeConteudo = produto.unidadeConteudo || (isDireta ? unidadeCompra : 'g');
    setForm({
      codigo: produto.codigo,
      nome: produto.nome,
      marcaReferencia: produto.marcaReferencia || '',
      tipo: produto.tipo || (produto.controladoComoInsumo ? 'insumo' : 'venda'),
      categoria: produto.categoria || 'Bebidas Quentes',
      preco: produto.preco ?? '',
      precoCompra: produto.precoCompra ?? '',
      unidadeCompra: unidadeCompra,
      conteudoPorEmbalagem: conteudoPorEmbalagem,
      unidadeConteudo: unidadeConteudo,
      estoqueEmbalagens: produto.estoqueEmbalagens ?? produto.estoqueInsumos ?? '',
      estoqueConteudoAberto: produto.estoqueConteudoAberto ?? 0,
      estoqueMinimoEmbalagens: produto.estoqueMinimoEmbalagens ?? produto.estoqueMinimoInsumos ?? '',
      rendimentoPorUnidadeCompra: produto.rendimentoPorUnidadeCompra ?? '',
      custo: produto.custoUnitario ?? produto.custo ?? '',
      estoque: produto.tipo === 'insumo' ? (produto.estoqueInsumos ?? '') : (produto.estoque ?? ''),
      unidadeVenda: produto.unidadeVenda || 'un',
      vendidoFracionado: Boolean(produto.vendidoFracionado),
      aFazer: Boolean(produto.aFazer),
      fichaTecnica: produto.fichaTecnica || [],
      producaoPropria: Boolean(produto.producaoPropria),
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
    const textoOk = [produto.nome, produto.codigo].join(' ').toLowerCase().includes(filtroTexto.toLowerCase());
    return tipoOk && categoriaOk && textoOk;
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
                    <input className="product-radio" type="radio" name="tipoProduto" value="venda" disabled={Boolean(editing)} checked={form.tipo === 'venda'} onChange={() => setForm({ ...form, tipo: 'venda', categoria: 'Bebidas Quentes' })} />
                    Produto à venda
                  </label>
                  <label className="product-radio-option">
                    <input className="product-radio" type="radio" name="tipoProduto" value="insumo" disabled={Boolean(editing)} checked={form.tipo === 'insumo'} onChange={() => setForm({ ...form, tipo: 'insumo', categoria: 'Insumos' })} />
                    Insumo / Matéria-prima
                  </label>
                </div>
              </div>
              <label>Código {!editing && <small>(automático)</small>}
                <input value={form.codigo} readOnly={!editing} onChange={(event) => setForm({ ...form, codigo: event.target.value })} style={{ background: !editing ? 'var(--bg-tertiary)' : 'var(--input-bg)', cursor: !editing ? 'not-allowed' : 'text' }} />
              </label>
              <label>Nome *
                <input value={form.nome} required onChange={(event) => setForm({ ...form, nome: event.target.value })} />
              </label>
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
                  <input value="Insumos" readOnly />
                </label>
              )}
            </div>
          </section>

          {form.tipo === 'venda' ? (
            <section className="product-form-section">
              <div className="product-section-title"><span>💰</span><div><strong>VENDA</strong><small>Dados do produto pronto</small></div></div>
              <div className="product-form-grid">
                <label>Preço de venda (R$) * <input type="number" step="0.01" min={0} value={form.preco} required onChange={(event) => setForm({ ...form, preco: event.target.value })} /></label>
                <label>Estoque atual <input type="number" step="0.001" min={0} value={form.estoque} onChange={(event) => setForm({ ...form, estoque: event.target.value })} /></label>
                <label>Unidade de venda
                  <select value={form.unidadeVenda} onChange={(event) => setForm({ ...form, unidadeVenda: event.target.value })}>
                    {['un', 'kg', 'g', 'l', 'ml'].map((unidade) => <option key={unidade} value={unidade}>{unidade}</option>)}
                  </select>
                </label>
                <label className="product-checkbox-label">
                  <input className="product-checkbox" type="checkbox" checked={form.vendidoFracionado} onChange={(event) => setForm({ ...form, vendidoFracionado: event.target.checked })} />
                  Permitir venda fracionada
                </label>
                <label className="product-checkbox-label">
                  <input className="product-checkbox" type="checkbox" checked={Boolean(form.aFazer)} onChange={(event) => setForm({ ...form, aFazer: event.target.checked })} />
                  Coz — preparado na cozinha (precisa de ficha técnica)
                </label>
                <label className="product-checkbox-label">
                  <input className="product-checkbox" type="checkbox" checked={Boolean(form.producaoPropria)} onChange={(event) => setForm({ ...form, producaoPropria: event.target.checked })} />
                  PP — produção própria (precisa de receita)
                </label>
              </div>
            </section>
          ) : (
            <>
            <section className="product-form-section">
              <div className="product-section-title"><span>💰</span><div><strong>COMPRA</strong><small>Preço, conteúdo e quantidade de embalagens</small></div></div>
              <div className="product-form-grid">
                <label>Preço de compra POR EMBALAGEM (R$) * <input type="number" step="0.01" min={0} value={form.precoCompra} required={!editingInsumo} readOnly={editingInsumo} onChange={(event) => setForm({ ...form, precoCompra: event.target.value })} /></label>
                <label>Tipo de embalagem * <small>Unidade em que você compra</small>
                  <select value={form.unidadeCompra} disabled={editingInsumo} onChange={(event) => {
                    const direta = ['kg', 'g', 'mg', 'l', 'ml', 'un'].includes(event.target.value);
                    setForm({ ...form, unidadeCompra: event.target.value, conteudoPorEmbalagem: direta ? 1 : '', unidadeConteudo: direta ? event.target.value : 'g' });
                  }}>
                    {['kg', 'g', 'mg', 'l', 'ml', 'un', 'lata', 'caixa', 'pacote', 'rolo'].map((unidade) => <option key={unidade} value={unidade}>{unidade}</option>)}
                  </select>
                </label>
                <label>Conteúdo da embalagem * <small>Quanto tem dentro de cada embalagem</small>
                  <div className="product-input-with-unit"><input type="number" step="0.001" min={0} required={!editingInsumo} readOnly={editingInsumo} value={form.conteudoPorEmbalagem} onChange={(event) => setForm({ ...form, conteudoPorEmbalagem: event.target.value })} /><select value={form.unidadeConteudo} disabled={editingInsumo} onChange={(event) => setForm({ ...form, unidadeConteudo: event.target.value })}>{['un', 'g', 'kg', 'mg', 'ml', 'l'].map((unidade) => <option key={unidade} value={unidade}>{unidade}</option>)}</select></div>
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
            <select value={filtroCategoria} onChange={(event) => setFiltroCategoria(event.target.value)} style={{ minHeight: 40, borderRadius: 10, border: '1px solid var(--border-color)', background: 'var(--bg-tertiary)', color: 'var(--text-primary)', padding: '8px 10px' }}>
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
                    <strong>R$ {Number(produto.preco || 0).toFixed(2).replace('.', ',')}</strong>
                    <small>{produto.tipo === 'insumo' ? `Compra: R$ ${Number(produto.precoCompra || 0).toFixed(2).replace('.', ',')}` : `Categoria: ${produto.categoria}`}</small>
                    <small className={produto.tipo === 'insumo' ? ((produto.resumoInsumo?.abaixoMinimo || produto.resumoInsumo?.esgotado) ? 'low-stock' : '') : (Number(produto.estoque || 0) <= 5 ? 'low-stock' : '')}>{produto.tipo === 'insumo' ? (Number(produto.resumoInsumo?.embalagensFechadas || produto.estoqueEmbalagens || produto.estoqueInsumos || 0).toLocaleString('pt-BR', { maximumFractionDigits: 3 })) : (Number(produto.estoque) || 0)} {produto.tipo === 'insumo' ? (produto.unidadeCompra || 'embalagens') : 'em estoque'}</small>
                    {produto.tipo === 'insumo' && produto.resumoInsumo && <small>{Number(produto.resumoInsumo.totalKg || produto.resumoInsumo.total || 0).toLocaleString('pt-BR', { maximumFractionDigits: 3 })} {produto.resumoInsumo.totalKg ? 'kg disponíveis' : produto.resumoInsumo.unidadeConteudo} · R$ {(produto.resumoInsumo.custoUnitarioBase || 0).toLocaleString('pt-BR', { minimumFractionDigits: 6, maximumFractionDigits: 6 })}/{produto.resumoInsumo.unidadeConteudo}</small>}
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
        .product-section-title { display: flex; align-items: center; gap: 9px; padding-bottom: 10px; border-bottom: 1px solid var(--border-light); }
        .product-section-title > span { font-size: 17px; }
        .product-section-title div { display: grid; gap: 3px; }
        .product-section-title strong { color: var(--text-primary); font-size: 11px; letter-spacing: .06em; }
        .product-section-title small { color: var(--text-secondary); font-size: 11px; }
        .product-form-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
        .product-form-section label { display: grid; gap: 6px; color: var(--text-secondary); font-size: 12px; font-weight: 700; }
        .product-form-section input, .product-form-section select { width: 100%; box-sizing: border-box; min-height: 42px; padding: 9px 11px; border: 1px solid var(--border-color); border-radius: 8px; background: var(--input-bg); color: var(--input-text); font: inherit; }
        .product-input-with-unit { display: grid; grid-template-columns: minmax(0, 1fr) 76px; gap: 8px; }
        .product-summary-section { background: var(--bg-secondary); }
        .product-summary-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 10px; }
        .product-summary-grid div { display: grid; gap: 4px; padding: 12px; border: 1px solid var(--border-light); border-radius: 9px; }
        .product-summary-grid span { color: var(--text-secondary); font-size: 11px; }
        .product-summary-grid strong { color: var(--text-primary); font-size: 14px; }
        .product-type-field { display: grid; gap: 6px; color: var(--text-secondary); font-size: 12px; font-weight: 700; }
        .product-type-label { display: block; }
        .product-radio-group { display: flex; align-items: center; gap: 18px; min-height: 42px; flex-wrap: wrap; }
        .product-form-section .product-radio-option { display: inline-flex; align-items: center; gap: 8px; min-height: 32px; color: var(--text-primary); font-weight: 600; cursor: pointer; }
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
        @media (max-width: 640px) { .product-form-grid, .product-summary-grid { grid-template-columns: 1fr; } }
      `}</style>
    </div>
  );
}

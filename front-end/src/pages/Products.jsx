import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '../services/api.jsx';
import { useToast } from '../components/Toast.jsx';


const categorias = ['Bebidas Quentes', 'Bebidas geladas', 'Salgados', 'Doces', 'Insumos', 'Outros'];


export default function Products() {
  const [produtos, setProdutos] = useState([]);
  const vazio = { codigo: '', nome: '', categoria: 'Bebidas Quentes', preco: '', custo: '', estoque: '', estoqueInsumos: '', estoqueMinimoInsumos: '', unidadeVenda: 'un', vendidoFracionado: false, aFazer: false, fichaTecnica: [], producaoPropria: false, controladoComoInsumo: false };
  const [form, setForm] = useState(vazio);

  const handleCategoriaChange = (categoria) => {
    setForm((prev) => ({
      ...prev,
      categoria,
      controladoComoInsumo: categoria === 'Insumos' ? true : prev.controladoComoInsumo,
    }));
  };
  const [editing, setEditing] = useState(null);
  const [filtro, setFiltro] = useState('');
  const [categoriaFiltro, setCategoriaFiltro] = useState('Todas');
  const { showToast } = useToast();


  useEffect(() => { carregar(); }, []);

  // Gera próximo código automaticamente
  useEffect(() => {
    if (!editing && produtos.length > 0) {
      gerarProximoCodigo();
    }
  }, [produtos, editing]);

  const carregar = async () => {
    const res = await api.get('/products');
    setProdutos(res.data);
  };

  const gerarProximoCodigo = () => {
    if (produtos.length === 0) {
      setForm(prev => ({ ...prev, codigo: '1' }));
      return;
    }
    const maiorCodigo = produtos.reduce((maior, p) => {
      const cod = parseInt(p.codigo) || 0;
      return cod > maior ? cod : maior;
    }, 0);
    setForm(prev => ({ ...prev, codigo: String(maiorCodigo + 1) }));
  };

  // 🔒 Verifica duplicidade de CÓDIGO
  const codigoJaExiste = (codigo, idEdicao = null) => {
    return produtos.some(p => 
      String(p.codigo) === String(codigo) && p._id !== idEdicao
    );
  };


  const submit = async (e) => {
    e.preventDefault();

    // ✅ Verifica duplicidade
    if (codigoJaExiste(form.codigo, editing?._id)) {
      return showToast('⚠️ Este código já está cadastrado! Use outro.', 'warning');
    }

    const dados = { ...form, preco: parseFloat(form.preco), custo: parseFloat(form.custo) || 0, estoque: parseFloat(form.estoque) || 0, estoqueInsumos: parseFloat(form.estoqueInsumos) || 0, estoqueMinimoInsumos: parseFloat(form.estoqueMinimoInsumos) || 0, unidadeVenda: form.unidadeVenda, vendidoFracionado: form.vendidoFracionado, aFazer: form.aFazer, fichaTecnica: form.fichaTecnica.filter((item) => item.produtoId && Number(item.quantidade) > 0).map((item) => ({ ...item, quantidade: Number(item.quantidade) })), producaoPropria: form.producaoPropria, controladoComoInsumo: form.controladoComoInsumo };
    try {
      editing ? await api.put(`/products/${editing._id}`, dados) : await api.post('/products', dados);
      showToast(editing ? '✅ Produto atualizado!' : '✅ Produto cadastrado!', 'success');
      setForm(vazio);
      setEditing(null);
      carregar();
    } catch (err) {
      showToast(err.response?.data?.msg || '❌ Erro ao salvar', 'error');
    }
  };


  const alterar = (p) => {
    setEditing(p);
    setForm({ codigo: p.codigo, nome: p.nome, categoria: p.categoria, preco: p.preco, custo: p.custo || '', estoque: p.estoque, estoqueInsumos: p.estoqueInsumos || '', estoqueMinimoInsumos: p.estoqueMinimoInsumos || '', unidadeVenda: p.unidadeVenda || 'un', vendidoFracionado: Boolean(p.vendidoFracionado), aFazer: Boolean(p.aFazer), fichaTecnica: p.fichaTecnica || [], producaoPropria: Boolean(p.producaoPropria), controladoComoInsumo: Boolean(p.controladoComoInsumo) });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };


  const remover = async (id) => {
    if (!window.confirm('Excluir este produto?')) return;
    await api.delete(`/products/${id}`);
    showToast('Produto removido', 'warning');
    carregar();
  };

  const corrigirHistoricoBolos = async () => {
    if (!window.confirm('Corrigir o histórico de bolos registrados em gramas para quilogramas? O valor das vendas será preservado.')) return;
    try {
      const response = await api.post('/products/migracoes/corrigir-bolos-gramas');
      showToast(`${response.data.produtosCorrigidos || 0} produto(s) e ${response.data.itensCorrigidos || 0} item(ns) histórico(s) corrigidos.`, 'success');
    } catch (err) {
      showToast(err.response?.data?.msg || 'Não foi possível corrigir o histórico.', 'error');
    }
  };


  const cancelar = () => {
    setEditing(null);
    setForm(vazio);
  };


  const filtrados = produtos.filter(p =>
    (categoriaFiltro === 'Todas' || p.categoria === categoriaFiltro) &&
    (p.nome.toLowerCase().includes(filtro.toLowerCase()) || String(p.codigo).includes(filtro))
  );


  return (
    <div>
      <div className="page-heading">
        <div>
          <h1>📦 Cadastro de Produtos</h1>
          <p>Gerencie seu catálogo de produtos</p>
        </div>
        <button type="button" onClick={corrigirHistoricoBolos} style={{ padding: '10px 14px', border: '1px solid var(--accent-border)', borderRadius: 10, background: 'var(--accent-light)', color: 'var(--accent-primary)', fontWeight: 700, cursor: 'pointer' }}>
          Corrigir bolos do catálogo e histórico
        </button>
      </div>


      <div style={{
        background: 'var(--bg-secondary)', border: '1px solid var(--border-color)',
        borderRadius: 16, padding: 16, marginBottom: 16
      }}>
        <h3 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 14px', color: 'var(--text-primary)' }}>
          {editing ? '✏️ Editar Produto' : '➕ Novo Produto'}
        </h3>
        <form onSubmit={submit}>
          <section className="product-form-section">
            <div className="product-section-title"><span>📋</span><div><strong>DADOS BÁSICOS</strong><small>Identificação e preço de venda</small></div></div>
            <div className="product-form-grid product-basic-grid">
              <label className="product-code-field">Código {!editing && <small>(automático)</small>}<input placeholder="Automático" value={form.codigo} readOnly={!editing} onChange={e => setForm({ ...form, codigo: e.target.value })} style={{ ...inputStyle, background: !editing ? 'var(--bg-tertiary)' : 'var(--input-bg)', cursor: !editing ? 'not-allowed' : 'text' }} /></label>
              <label>Nome *<input placeholder="Nome do produto" value={form.nome} required onChange={e => setForm({ ...form, nome: e.target.value })} /></label>
              <label>Categoria<select value={form.categoria} onChange={e => handleCategoriaChange(e.target.value)}>{categorias.map(c => <option key={c}>{c}</option>)}</select></label>
              <label>Preço de venda (R$) *<input type="number" step="0.01" min={0} placeholder="0,00" value={form.preco} required onChange={e => setForm({ ...form, preco: e.target.value })} /></label>
            </div>
          </section>

          <section className="product-form-section">
            <div className="product-section-title"><span>📦</span><div><strong>ESTOQUE</strong><small>Quantidade disponível para venda</small></div></div>
            <div className="product-form-grid product-stock-grid">
              <label>Estoque atual<input type="number" step="0.001" min={0} placeholder="0" value={form.estoque} onChange={e => setForm({ ...form, estoque: e.target.value })} /></label>
              <label>Unidade de venda<select value={form.unidadeVenda} onChange={e => setForm({ ...form, unidadeVenda: e.target.value })}>{['un', 'kg', 'g', 'l', 'ml'].map(unidade => <option key={unidade} value={unidade}>{unidade}</option>)}</select></label>
            </div>
          </section>

          <section className="product-form-section">
            <div className="product-section-title"><span>⚙️</span><div><strong>TIPO DE PRODUTO</strong><small>Defina como este produto será usado na operação</small></div></div>
            <div className="product-check-grid">
              <label><input type="checkbox" checked={form.categoria === 'Insumos' || form.controladoComoInsumo} disabled={form.categoria === 'Insumos'} onChange={(e) => setForm((prev) => ({ ...prev, controladoComoInsumo: prev.categoria === 'Insumos' ? true : e.target.checked }))} />Controlar também como insumo</label>
              <label><input type="checkbox" checked={form.producaoPropria} onChange={e => setForm({ ...form, producaoPropria: e.target.checked })} />Produto de produção própria</label>
              <label><input type="checkbox" checked={form.vendidoFracionado} onChange={e => setForm({ ...form, vendidoFracionado: e.target.checked })} />Permitir venda fracionada</label>
              <label><input type="checkbox" checked={form.aFazer} onChange={e => setForm({ ...form, aFazer: e.target.checked })} />Enviar automaticamente para Cozinha</label>
            </div>
            {form.producaoPropria && <Link className="production-link" to="/producao">Após cadastrar, monte a receita aqui →</Link>}
            {form.aFazer && <div className="technical-sheet"><strong>Ficha técnica do produto</strong><small>Insumos consumidos por unidade deste produto.</small>{form.fichaTecnica.map((item, index) => <div className="technical-row" key={`${index}-${item.produtoId}`}><select value={item.produtoId} onChange={e => setForm({ ...form, fichaTecnica: form.fichaTecnica.map((current, itemIndex) => itemIndex === index ? { ...current, produtoId: e.target.value } : current) })}><option value="">Ingrediente</option>{produtos.filter((produto) => produto._id !== editing?._id).map((produto) => <option key={produto._id} value={produto._id}>{produto.nome}</option>)}</select><input type="number" min="0.001" step="0.001" placeholder="Quantidade" value={item.quantidade} onChange={e => setForm({ ...form, fichaTecnica: form.fichaTecnica.map((current, itemIndex) => itemIndex === index ? { ...current, quantidade: e.target.value } : current) })} /><select value={item.unidade || 'un'} onChange={e => setForm({ ...form, fichaTecnica: form.fichaTecnica.map((current, itemIndex) => itemIndex === index ? { ...current, unidade: e.target.value } : current) })}>{['un', 'kg', 'g', 'l', 'ml'].map(unidade => <option key={unidade}>{unidade}</option>)}</select><button type="button" onClick={() => setForm({ ...form, fichaTecnica: form.fichaTecnica.filter((_, itemIndex) => itemIndex !== index) })}>×</button></div>)}<button type="button" className="technical-add" onClick={() => setForm({ ...form, fichaTecnica: [...form.fichaTecnica, { produtoId: '', quantidade: '', unidade: 'un' }] })}>Adicionar insumo</button></div>}
          </section>

          {(form.categoria === 'Insumos' || form.controladoComoInsumo) && <section className="product-form-section product-insumo-section"><div className="product-section-title"><span>🧺</span><div><strong>ESTOQUE DE INSUMO</strong><small>Controle separado para produção</small></div></div><div className="product-form-grid"><label>Estoque de Insumo<input type="number" step="0.001" min={0} placeholder="0" value={form.estoqueInsumos} onChange={e => setForm({ ...form, estoqueInsumos: e.target.value })} /></label><label>Estoque Mínimo<input type="number" step="0.001" min={0} placeholder="0" value={form.estoqueMinimoInsumos} onChange={e => setForm({ ...form, estoqueMinimoInsumos: e.target.value })} /></label></div></section>}

          <section className="product-form-section product-cost-section"><div className="product-section-title"><span>💰</span><div><strong>CUSTO</strong><small>Preenchido pela Calculadora de Custo</small></div></div><label>Custo unitário (R$)<input type="number" value={form.custo} disabled readOnly placeholder="Calculado automaticamente" /></label><small className="field-help">Calculado automaticamente na Calculadora de Custo</small></section>
          <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
            <button type="submit" style={{
              flex: 1, padding: '12px', background: 'var(--accent-primary)', color: '#fff',
              border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 700,
              cursor: 'pointer', minHeight: 46
            }}>{editing ? 'Atualizar' : 'Cadastrar'}</button>
            {editing && <button type="button" onClick={cancelar} style={{
              padding: '12px 20px', background: 'var(--bg-secondary)', color: 'var(--text-secondary)',
              border: '1.5px solid var(--border-color)', borderRadius: 10,
              fontSize: 14, fontWeight: 600, cursor: 'pointer', minHeight: 46
            }}>Cancelar</button>}
          </div>
        </form>
      </div>


      <div style={{
        background: 'var(--bg-secondary)', border: '1px solid var(--border-color)',
        borderRadius: 16, padding: 16
      }}>
        <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 12, marginBottom: 4 }}>
          {['Todas', ...categorias].map(categoria => <button key={categoria} onClick={() => setCategoriaFiltro(categoria)} style={{ flexShrink: 0, minHeight: 40, padding: '8px 13px', borderRadius: 20, border: categoriaFiltro === categoria ? '1px solid var(--accent-primary)' : '1px solid var(--border-color)', background: categoriaFiltro === categoria ? 'var(--accent-primary)' : 'var(--bg-tertiary)', color: categoriaFiltro === categoria ? '#fff' : 'var(--text-secondary)', fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>{categoria}</button>)}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 10 }}>
          <h3 style={{ fontSize: 15, fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
            Cadastrados
            <span style={{ background: 'var(--accent-light)', color: 'var(--accent-primary)', padding: '3px 10px', borderRadius: 20, fontSize: 12, fontWeight: 600 }}>
              {filtrados.length}
            </span>
          </h3>
          <input placeholder="Filtrar..." value={filtro}
            onChange={e => setFiltro(e.target.value)}
            style={{ ...inputStyle, width: 180, padding: '8px 12px', minHeight: 40 }} />
        </div>


        {filtrados.length === 0 ? <div style={{ textAlign: 'center', padding: 36, color: 'var(--text-secondary)', fontSize: 13 }}>Nenhum produto nesta categoria</div> : <div className="product-admin-grid">{filtrados.map(p => { const cat = corCategoria[p.categoria] || corCategoria.Outros; return <article key={p._id} className="product-admin-card"><div><span style={{ background: cat.bg, color: cat.txt, padding: '3px 9px', borderRadius: 20, fontSize: 10, fontWeight: 700 }}>{p.categoria}</span><h4>{p.nome}</h4><span className="product-code">Código {p.codigo}</span>{p.producaoPropria && <small className="product-tag">PP</small>}</div><div className="product-admin-footer"><div><strong>R$ {Number(p.preco).toFixed(2).replace('.', ',')}</strong><small> Custo R$ {Number(p.custo || 0).toFixed(2).replace('.', ',')}</small><small className={p.estoque <= 5 ? 'low-stock' : ''}>{p.estoque} venda · {p.estoqueInsumos || 0} insumo(s)</small></div><div className="product-card-actions"><button onClick={() => alterar(p)} style={btnTable}>Editar</button><button onClick={() => remover(p._id)} style={{ ...btnTable, background: 'rgba(239, 68, 68, 0.1)', color: 'var(--error-bg)', borderColor: 'rgba(239, 68, 68, 0.2)' }}>Excluir</button></div></div></article>; })}</div>}
      </div>


      <style>{`
        @media (min-width: 640px) {
          .form-grid-prod { grid-template-columns: 1fr 1fr !important; }
        }
        @media (min-width: 1024px) {
          .form-grid-prod { grid-template-columns: 1fr 2fr 1fr 1fr 1fr 1fr !important; }
        }
        .product-form-section {
          display: grid;
          gap: 14px;
          margin-top: 14px;
          padding: 16px;
          border: 1px solid var(--border-light);
          border-radius: 12px;
          background: var(--bg-tertiary);
        }
        .product-section-title {
          display: flex;
          align-items: center;
          gap: 9px;
          padding-bottom: 10px;
          border-bottom: 1px solid var(--border-light);
        }
        .product-section-title > span { font-size: 17px; line-height: 1; }
        .product-section-title div { display: grid; gap: 3px; }
        .product-section-title strong { color: var(--text-primary); font-size: 11px; letter-spacing: .06em; }
        .product-section-title small { color: var(--text-secondary); font-size: 11px; font-weight: 400; }
        .product-form-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
        .product-form-section label { display: grid; gap: 6px; color: var(--text-secondary); font-size: 12px; font-weight: 700; }
        .product-form-section label input:not([type="checkbox"]),
        .product-form-section label select { width: 100%; box-sizing: border-box; min-height: 42px; padding: 9px 11px; border: 1px solid var(--border-color); border-radius: 8px; background: var(--input-bg); color: var(--input-text); font: inherit; }
        .product-basic-grid { grid-template-columns: 110px minmax(180px, 1.6fr) minmax(160px, 1fr) minmax(150px, 1fr); }
        .product-code-field input { font-size: 13px !important; }
        .product-code-field small { color: var(--text-tertiary); font-size: 10px; font-weight: 400; }
        .product-check-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 9px 16px; }
        .product-check-grid label { display: flex; align-items: center; min-height: 36px; }
        .product-check-grid input { width: 17px; height: 17px; margin: 0 8px 0 0; accent-color: var(--accent-primary); }
        .production-link { justify-self: start; color: var(--accent-primary); font-size: 12px; font-weight: 700; text-decoration: none; }
        .production-link:hover { text-decoration: underline; }
        .product-cost-section input:disabled { background: var(--bg-secondary); color: var(--text-secondary); cursor: not-allowed; opacity: .75; }
        .field-help { color: var(--text-secondary); font-size: 11px; }
        .product-insumo-section { border-color: var(--accent-border); }
        .product-admin-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(210px, 1fr)); gap: 12px; }
        .product-admin-card { min-height: 150px; display: flex; flex-direction: column; padding: 14px; border: 1px solid var(--border-color); border-radius: 14px; background: var(--bg-tertiary); }
        .product-admin-card h4 { margin: 12px 0 4px; color: var(--text-primary); font-size: 14px; line-height: 1.3; }
        .product-code { color: var(--text-secondary); font-family: monospace; font-size: 11px; }
        .product-admin-footer { display: flex; flex-direction: column; align-items: stretch; gap: 10px; margin-top: auto; padding-top: 16px; }
        .product-admin-footer > div:first-child { min-height: 38px; display: flex; flex-direction: column; justify-content: flex-end; }
        .product-card-actions { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 6px; }
        .product-card-actions button { width: 100%; min-height: 36px; margin: 0 !important; box-sizing: border-box; display: inline-flex; align-items: center; justify-content: center; }
        .product-admin-footer strong { display: block; color: var(--accent-primary); font-size: 17px; }
        .product-admin-footer small { display: block; color: var(--text-secondary); font-size: 11px; margin-top: 3px; }
        .product-admin-footer .low-stock { color: var(--error-bg); font-weight: 700; }
        .product-tag { display: inline-block; margin-left: 10px; color: var(--success-bg); font-size: 11px; font-weight: 800; letter-spacing: .08em; }
        .technical-sheet { grid-column: 1 / -1; display: grid; gap: 8px; padding: 12px; border: 1px solid var(--accent-border); border-radius: 10px; background: var(--accent-light); }
        .technical-sheet strong { color: var(--accent-primary); font-size: 13px; }
        .technical-sheet small { color: var(--text-secondary); font-size: 11px; }
        .technical-row { display: grid; grid-template-columns: 2fr 1fr 80px 34px; gap: 6px; }
        .technical-row input, .technical-row select { min-width: 0; padding: 8px; border: 1px solid var(--border-color); border-radius: 8px; background: var(--input-bg); color: var(--input-text); }
        .technical-row button { border: 1px solid var(--border-color); border-radius: 8px; color: var(--error-bg); cursor: pointer; }
        .technical-add { justify-self: start; padding: 7px 10px; border: 1px solid var(--accent-border); border-radius: 8px; background: var(--bg-secondary); color: var(--accent-primary); font-size: 11px; font-weight: 700; cursor: pointer; }
        @media (max-width: 1023px) { .product-basic-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
        @media (max-width: 640px) { .product-form-grid, .product-basic-grid, .product-check-grid { grid-template-columns: 1fr; } .technical-row { grid-template-columns: 1fr; } .technical-row button { min-height: 36px; } }
      `}</style>
    </div>
  );
}


const corCategoria = {
  'Bebidas Quentes': { bg: 'var(--category-hot-bg)', txt: 'var(--category-hot-text)' },
  'Bebidas geladas': { bg: 'var(--category-cold-bg)', txt: 'var(--category-cold-text)' },
  Salgados: { bg: 'var(--category-savory-bg)', txt: 'var(--category-savory-text)' },
  Doces: { bg: 'var(--category-sweet-bg)', txt: 'var(--category-sweet-text)' },
  Insumos: { bg: 'var(--category-supply-bg)', txt: 'var(--category-supply-text)' },
  Outros: { bg: 'var(--category-other-bg)', txt: 'var(--category-other-text)' }
};


const inputStyle = {
  width: '100%', padding: '12px 14px', border: '1.5px solid var(--border-color)',
  borderRadius: 10, fontSize: 16, boxSizing: 'border-box',
  outline: 'none', background: 'var(--input-bg)', color: 'var(--input-text)', minHeight: 48
};


const btnTable = {
  padding: '6px 12px', margin: '0 3px', background: 'var(--bg-secondary)', color: 'var(--text-primary)',
  border: '1px solid var(--border-color)', borderRadius: 8, fontSize: 12,
  fontWeight: 600, cursor: 'pointer', minHeight: 34
};

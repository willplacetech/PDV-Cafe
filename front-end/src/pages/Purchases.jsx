import { useEffect, useState } from 'react';
import api from '../services/api.jsx';
import { useToast } from '../components/useToast.js';

const units = ['kg', 'L', 'un'];
const decimalStep = (unit) => unit === 'un' ? '0.01' : '0.001';
const decimalMinimum = (unit) => unit === 'un' ? 0.01 : 0.001;
const purchaseQuantityStep = (unit) => unit === 'un' ? '1' : '0.001';
const purchaseQuantityMinimum = (unit) => unit === 'un' ? 1 : 0.001;
const newItem = () => ({ produtoId: '', valorTotal: '', qtdEmbalagens: '1', conteudoPorEmbalagem: '', unidadeConteudo: 'un' });
const today = () => {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};
const money = (value) => `R$ ${Number(value || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const categoriasVenda = ['Bebidas Quentes', 'Bebidas geladas', 'Salgados', 'Doces', 'Congelados', 'Sorvetes', 'Pratos na Hora', 'Outros'];
const formatQuantidade = (valor, unidade) => `${Number(valor || 0).toLocaleString('pt-BR', { maximumFractionDigits: 3 })} ${unidade}`;
const formatCustoUnitario = (valor, unidade) => `R$ ${Number(valor || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}/${unidade}`;
const newSupply = () => ({ tipoProduto: 'insumo', nome: '', precoCompra: '', precoVenda: '', conteudoPorEmbalagem: '1', unidadeConteudo: 'un', estoqueEmbalagens: '0', rendimentoPorReceita: '1' });
const getInsumoMeta = (produto = {}) => {
  const unidadeConteudo = produto.unidadeConteudo || 'un';
  const unidadeCompra = produto.unidadeCompra || unidadeConteudo;
  const precoCompra = Number(produto.precoCompra ?? 0);
  const conteudoPorEmbalagem = Number(produto.conteudoPorEmbalagem ?? 1);
  const custoUnitarioBase = Number(produto.custoUnitarioBase ?? (precoCompra && conteudoPorEmbalagem ? (precoCompra / conteudoPorEmbalagem) : 0));
  const quantidadeDisponivel = Number(produto.estoqueInsumosTotal ?? ((Number(produto.estoqueInsumos ?? produto.estoqueEmbalagens ?? 0) * conteudoPorEmbalagem) || 0));

  return { unidadeConteudo, unidadeCompra, precoCompra, conteudoPorEmbalagem, custoUnitarioBase, quantidadeDisponivel };
};
const getNextProductCode = (productList) => {
  const maxNumber = productList.reduce((higher, product) => {
    const codeValue = Number(String(product.codigo || '').replace(/\D/g, ''));
    return Number.isFinite(codeValue) && codeValue > higher ? codeValue : higher;
  }, 99900);
  return String(Math.max(99900, maxNumber + 1));
};

export default function Purchases() {
  const [products, setProducts] = useState([]);
  const [purchases, setPurchases] = useState([]);
  const [form, setForm] = useState({ fornecedor: '', numeroNF: '', data: today(), metodoCusteio: 'media_ponderada', itens: [newItem()] });
  const [supplyForm, setSupplyForm] = useState(newSupply());
  const [supplyModalOpen, setSupplyModalOpen] = useState(false);
  const [supplyTargetIndex, setSupplyTargetIndex] = useState(null);
  const [savingSupply, setSavingSupply] = useState(false);
  const [saving, setSaving] = useState(false);
  const [expandedPurchaseId, setExpandedPurchaseId] = useState(null);
  const { showToast } = useToast();

  const load = async () => {
    try {
      const [productsResponse, purchasesResponse] = await Promise.all([api.get('/products'), api.get('/compras')]);
      setProducts(productsResponse.data || []);
      setPurchases(purchasesResponse.data || []);
    } catch (error) {
      showToast(error.response?.data?.msg || 'Nao foi possivel carregar as compras', 'error');
    }
  };

  useEffect(() => {
    const loadInitialData = async () => {
      try {
        const [productsResponse, purchasesResponse] = await Promise.all([api.get('/products'), api.get('/compras')]);
        setProducts(productsResponse.data || []);
        setPurchases(purchasesResponse.data || []);
      } catch (error) {
        showToast(error.response?.data?.msg || 'Nao foi possivel carregar as compras', 'error');
      }
    };
    loadInitialData();
  }, [showToast]);

  const updateItem = (index, field, value) => {
    setForm((current) => ({ ...current, itens: current.itens.map((item, itemIndex) => itemIndex === index ? { ...item, [field]: value } : item) }));
  };

  const updatePurchaseQuantity = (index, value) => {
    setForm((current) => ({
      ...current,
      itens: current.itens.map((item, itemIndex) => {
        if (itemIndex !== index) return item;
        const content = Number(item.conteudoPorEmbalagem);
        return {
          ...item,
          qtdEmbalagens: value === '' ? '' : content > 0 ? String(Number(value) / content) : value,
        };
      }),
    }));
  };

  const selectProduct = (index, produtoId) => {
    const produto = products.find((item) => String(item._id) === String(produtoId));
    setForm((current) => ({
      ...current,
      itens: current.itens.map((item, itemIndex) => itemIndex === index
        ? {
          ...item,
          produtoId,
          unidadeConteudo: produto?.unidadeConteudo || produto?.unidadeCompra || item.unidadeConteudo,
          conteudoPorEmbalagem: produto?.conteudoPorEmbalagem > 0 ? String(produto.conteudoPorEmbalagem) : item.conteudoPorEmbalagem,
        }
        : item),
    }));
  };

  const addItem = () => setForm((current) => ({ ...current, itens: [...current.itens, newItem()] }));
  const removeItem = (index) => setForm((current) => ({ ...current, itens: current.itens.length === 1 ? current.itens : current.itens.filter((_, itemIndex) => itemIndex !== index) }));

  const focusNextInput = (itemIndex) => {
    setTimeout(() => {
      const itemNode = document.querySelectorAll('.purchase-item')[itemIndex];
      const input = itemNode?.querySelector('input[type="number"]');
      if (input) input.focus();
    }, 0);
  };

  const openSupplyModal = (itemIndex = null) => {
    setSupplyTargetIndex(itemIndex);
    setSupplyForm(newSupply());
    setSupplyModalOpen(true);
  };

  const saveSupply = async (event) => {
    event.preventDefault();
    const nome = supplyForm.nome.trim();
    const tipoProduto = supplyForm.tipoProduto || 'insumo';
    const precoCompra = Number(supplyForm.precoCompra);
    const precoVenda = Number(supplyForm.precoVenda);
    const conteudoPorEmbalagem = Number(supplyForm.conteudoPorEmbalagem);

    if (!nome) return showToast('Informe o nome do insumo', 'warning');
    if (!Number.isFinite(precoCompra) || precoCompra < 0) return showToast('Informe um preço de compra válido', 'warning');
    if (tipoProduto !== 'insumo' && (!Number.isFinite(precoVenda) || precoVenda < 0)) return showToast('Informe um preço de venda válido', 'warning');
    if (!Number.isFinite(conteudoPorEmbalagem) || conteudoPorEmbalagem < 0) return showToast('Informe um conteúdo de embalagem válido', 'warning');

    const produtoExistente = products.find((product) => String(product.nome || '').trim().toLowerCase() === nome.toLowerCase());
    if (produtoExistente) {
      const fallbackIndex = supplyTargetIndex ?? form.itens.findIndex((item) => !item.produtoId);
      const targetIndex = fallbackIndex >= 0 ? fallbackIndex : 0;
      selectProduct(targetIndex, produtoExistente._id);
      setSupplyModalOpen(false);
      setSupplyTargetIndex(null);
      focusNextInput(targetIndex);
      showToast(`Já existe um insumo com este nome. ${produtoExistente.nome} foi selecionado automaticamente.`, 'warning');
      return;
    }

    setSavingSupply(true);
    try {
      const codigo = getNextProductCode(products);
      const unidadeConteudo = supplyForm.unidadeConteudo || 'un';
      const custoUnitarioBase = Number(precoCompra && conteudoPorEmbalagem ? (precoCompra / conteudoPorEmbalagem) : 0);
      const response = await api.post('/products', {
        codigo,
        nome,
        tipo: tipoProduto === 'insumo' ? 'insumo' : 'venda',
        tipoProduto: tipoProduto === 'insumo' ? undefined : tipoProduto,
        aFazer: tipoProduto === 'coz',
        producaoPropria: tipoProduto === 'producao',
        categoria: tipoProduto === 'insumo' ? 'Insumos' : (tipoProduto === 'coz' ? 'Pratos na Hora' : 'Outros'),
        preco: tipoProduto === 'insumo' ? 0 : precoVenda,
        precoCompra: tipoProduto === 'insumo' ? precoCompra : undefined,
        conteudoPorEmbalagem,
        unidadeConteudo,
        unidadeCompra: unidadeConteudo,
        custoUnitarioBase,
        estoque: tipoProduto === 'coz' ? 0 : Number(supplyForm.estoqueEmbalagens || 0),
        estoqueEmbalagens: tipoProduto === 'insumo' ? Number(supplyForm.estoqueEmbalagens || 0) : undefined,
        rendimentoPorReceita: tipoProduto === 'producao' ? Number(supplyForm.rendimentoPorReceita || 1) : 1,
        usavelEmReceita: false,
        ativo: true,
      });
      const newProduct = response.data;
      setProducts((current) => [...current, newProduct].sort((a, b) => a.nome.localeCompare(b.nome)));
      if (tipoProduto !== 'insumo') {
        setSupplyModalOpen(false);
        setSupplyTargetIndex(null);
        showToast(`${nome} cadastrado. Produtos que não são insumos não entram como item de compra.`, 'success');
        return;
      }
      const fallbackIndex = supplyTargetIndex ?? form.itens.findIndex((item) => !item.produtoId);
      const targetIndex = fallbackIndex >= 0 ? fallbackIndex : 0;
      setForm((current) => ({
        ...current,
        itens: current.itens.map((item, itemIndex) => itemIndex === targetIndex
          ? {
            ...item,
            produtoId: newProduct._id,
            unidadeConteudo: newProduct.unidadeConteudo || newProduct.unidadeCompra || 'un',
            conteudoPorEmbalagem: newProduct.conteudoPorEmbalagem > 0 ? String(newProduct.conteudoPorEmbalagem) : item.conteudoPorEmbalagem,
          }
          : item),
      }));
      setSupplyModalOpen(false);
      setSupplyTargetIndex(null);
      focusNextInput(targetIndex);
      showToast('Insumo cadastrado e selecionado na compra', 'success');
    } catch (error) {
      const validationMessage = error.response?.data?.errors?.map((item) => item.msg).join('; ');
      showToast(error.response?.data?.msg || validationMessage || 'Nao foi possivel cadastrar o insumo', 'error');
    } finally {
      setSavingSupply(false);
    }
  };

  const submit = async (event) => {
    event.preventDefault();
    setSaving(true);
    try {
      const itens = form.itens.map((item) => ({ ...item, valorTotal: Number(item.valorTotal), qtdEmbalagens: Number(item.qtdEmbalagens), conteudoPorEmbalagem: Number(item.conteudoPorEmbalagem) }));
      await api.post('/compras', { ...form, itens });
      showToast('Compra registrada e estoque atualizado', 'success');
      setForm({ fornecedor: '', numeroNF: '', data: today(), metodoCusteio: 'media_ponderada', itens: [newItem()] });
      await load();
    } catch (error) {
      showToast(error.response?.data?.msg || 'Nao foi possivel registrar a compra', 'error');
    } finally {
      setSaving(false);
    }
  };

  return <div className="purchases-page">
    <header className="page-heading"><div><span className="purchases-eyebrow">PRODUCAO / COMPRAS</span><h1>Compras</h1><p>Registre entradas de insumos e atualize o custo pelo recebimento.</p></div></header>
    <form className="purchases-form" onSubmit={submit}>
      <div className="purchases-grid">
        <label>Fornecedor<input required value={form.fornecedor} onChange={(event) => setForm({ ...form, fornecedor: event.target.value })} /></label>
        <label>Numero da NF<input required value={form.numeroNF} onChange={(event) => setForm({ ...form, numeroNF: event.target.value })} /></label>
        <label>Data<input required type="date" value={form.data} onChange={(event) => setForm({ ...form, data: event.target.value })} /></label>
        <label>Atualizacao de custo<select value={form.metodoCusteio} onChange={(event) => setForm({ ...form, metodoCusteio: event.target.value })}><option value="media_ponderada">Media ponderada</option><option value="ultimo_preco">Ultimo preco</option></select></label>
      </div>
      <div className="purchases-section-heading"><h2>Itens da compra</h2><button type="button" className="secondary" onClick={addItem}>Adicionar item</button></div>
      <div className="purchase-items">{form.itens.map((item, index) => {
        const unidadeConteudo = item.unidadeConteudo || 'un';
        const total = Number(item.qtdEmbalagens || 0) * Number(item.conteudoPorEmbalagem || 0);
        const unitCost = Number(item.valorTotal || 0) / (total || 1);
        const produtoSelecionado = products.find((product) => String(product._id) === String(item.produtoId));
        const metaProduto = getInsumoMeta(produtoSelecionado || { unidadeConteudo, precoCompra: item.valorTotal, conteudoPorEmbalagem: item.conteudoPorEmbalagem || 1, custoUnitarioBase: unitCost, estoqueInsumos: item.qtdEmbalagens || 0 });
        const unidadeExibicao = metaProduto.unidadeConteudo || unidadeConteudo;
        const valorUnitario = Number(metaProduto.custoUnitarioBase || unitCost || 0);
        return <div className="purchase-item" key={`purchase-item-${index}`}>
          <label className="purchase-product-field">Produto comprado<div className="purchase-product-input-group"><select required value={item.produtoId} onChange={(event) => selectProduct(index, event.target.value)}><option value="">Selecione</option>{products.map((product) => <option key={product._id} value={product._id}>{product.nome} [{product.tipo === 'insumo' ? 'Insumo' : 'Revenda'}]</option>)}</select><button type="button" className="secondary purchase-new-supply-button" onClick={() => openSupplyModal(index)}>➕ Novo Produto</button></div></label>
          <label>Valor total<input required type="number" min="0.01" step="0.01" value={item.valorTotal} onChange={(event) => updateItem(index, 'valorTotal', event.target.value)} /></label>
          <label>Quantidade comprada ({unidadeConteudo})<input required type="number" min={purchaseQuantityMinimum(item.unidadeConteudo)} step={purchaseQuantityStep(item.unidadeConteudo)} value={item.conteudoPorEmbalagem && total > 0 ? String(Number(total.toFixed(item.unidadeConteudo === 'un' ? 0 : 3))) : ''} onChange={(event) => updatePurchaseQuantity(index, event.target.value)} /></label>
          <label>Conteúdo por embalagem<input required type="number" min={decimalMinimum(item.unidadeConteudo)} step={decimalStep(item.unidadeConteudo)} value={item.conteudoPorEmbalagem} onChange={(event) => updateItem(index, 'conteudoPorEmbalagem', event.target.value)} /></label>
          <label>Unidade<select required value={item.unidadeConteudo} onChange={(event) => updateItem(index, 'unidadeConteudo', event.target.value)}>{units.map((unit) => <option key={unit}>{unit}</option>)}</select></label>
          <div className="purchase-calculation"><span>Total: <strong>{formatQuantidade(total, unidadeExibicao)}</strong></span><span>Custo unitario: <strong>{formatCustoUnitario(valorUnitario, unidadeExibicao)}</strong></span></div>
          <button type="button" className="danger" onClick={() => removeItem(index)} disabled={form.itens.length === 1}>Remover</button>
        </div>;
      })}</div>
      <button className="primary" disabled={saving}>{saving ? 'Registrando...' : 'Registrar compra'}</button>
    </form>
    <section className="purchases-history">
      <div className="purchases-section-heading"><h2>Historico de compras</h2><span>{purchases.length} registro(s)</span></div>
      {purchases.length ? purchases.map((purchase) => {
        const isExpanded = expandedPurchaseId === purchase._id;
        const itens = purchase.itens || [];
        return (
          <article key={purchase._id} className={`purchase-history-card ${isExpanded ? 'expanded' : ''}`}>
            <div className="purchase-history-header" onClick={() => setExpandedPurchaseId(isExpanded ? null : purchase._id)}>
              <div>
                <strong>{purchase.fornecedor}</strong>
                <span>NF {purchase.numeroNF} · {new Date(purchase.data).toLocaleDateString('pt-BR')}</span>
              </div>
              <div className="purchase-history-summary">
                <b>{money(purchase.valorTotal)}</b>
                <span className="expand-icon">{isExpanded ? '▲' : '▼'}</span>
              </div>
            </div>
            {isExpanded && (
              <div className="purchase-history-details">
                <table className="purchase-items-table">
                  <thead>
                    <tr>
                      <th>Produto</th>
                      <th>Qtd. Embalagens</th>
                      <th>Conteúdo/Emb.</th>
                      <th>Unidade</th>
                      <th>Qtd. Total</th>
                      <th>Valor Total</th>
                      <th>Custo Unit.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {itens.map((item, index) => {
                      const produto = item.produtoId || {};
                      const quantidadeTotal = Number(item.qtdEmbalagens || 0) * Number(item.conteudoPorEmbalagem || 0);
                      const custoUnitario = quantidadeTotal > 0 ? Number(item.valorTotal || 0) / quantidadeTotal : 0;
                      return (
                        <tr key={index}>
                          <td>{produto.nome || '—'}</td>
                          <td>{Number(item.qtdEmbalagens || 0).toLocaleString('pt-BR')}</td>
                          <td>{Number(item.conteudoPorEmbalagem || 0).toLocaleString('pt-BR', { maximumFractionDigits: 3 })}</td>
                          <td>{item.unidadeConteudo || 'un'}</td>
                          <td>{quantidadeTotal.toLocaleString('pt-BR', { maximumFractionDigits: 3 })}</td>
                          <td>{money(item.valorTotal)}</td>
                          <td>{custoUnitario.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}/{item.unidadeConteudo || 'un'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                <div className="purchase-history-footer">
                  <span><strong>Método de custeio:</strong> {purchase.metodoCusteio === 'media_ponderada' ? 'Média ponderada' : 'Último preço'}</span>
                  <span><strong>Data da compra:</strong> {new Date(purchase.data).toLocaleDateString('pt-BR')}</span>
                  {purchase.createdBy && <span><strong>Registrado por:</strong> {purchase.createdBy.username || purchase.createdBy}</span>}
                </div>
              </div>
            )}
          </article>
        );
      }) : <p>Nenhuma compra registrada.</p>}
    </section>
    {supplyModalOpen && <div className="purchase-supply-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setSupplyModalOpen(false); }}>
      <form onSubmit={saveSupply} className="purchase-supply-modal" role="dialog" aria-modal="true" aria-labelledby="new-supply-title">
        <div className="purchase-supply-modal-header"><div><h2 id="new-supply-title">➕ Novo Produto</h2><p>Cadastre o insumo e continue o lançamento da compra.</p></div><button type="button" className="purchase-supply-button purchase-supply-close" onClick={() => setSupplyModalOpen(false)} aria-label="Fechar modal">×</button></div>
        <div className="purchase-supply-grid">
          <label className="purchase-supply-field full">Tipo de produto<select value={supplyForm.tipoProduto} onChange={(event) => setSupplyForm({ ...supplyForm, tipoProduto: event.target.value })}><option value="insumo">Insumo</option><option value="revenda">Revenda</option></select></label>
          <label className="purchase-supply-field full">Nome *<input required value={supplyForm.nome} onChange={(event) => setSupplyForm({ ...supplyForm, nome: event.target.value })} placeholder="Ex.: Farinha de trigo" /></label>
          <label className="purchase-supply-field">Categoria<select value={form.categoria} onChange={(event) => setForm({ ...form, categoria: event.target.value })}>{categoriasVenda.map((categoria) => <option key={categoria} value={categoria}>{categoria}</option>)}
                  </select></label>
          <label className="purchase-supply-field">Unidade
            <select value={supplyForm.unidadeConteudo} onChange={(event) => setSupplyForm({ ...supplyForm, unidadeConteudo: event.target.value })}>{units.map((unit) => <option key={unit}>{unit}</option>)}</select></label>
        </div>
        <div className="purchase-supply-note">⚠️ Campos completos como estoque mínimo, marca e demais dados do produto podem ser editados depois em Cadastro → Insumos.</div>
        <div className="purchase-supply-actions"><button type="button" className="purchase-supply-button purchase-supply-button-secondary" onClick={() => setSupplyModalOpen(false)}>Cancelar</button><button type="submit" className="purchase-supply-button purchase-supply-button-primary" disabled={savingSupply}>{savingSupply ? 'Salvando...' : 'Salvar e continuar'}</button></div>
      </form>
    </div>}
    <style>{styles}</style>
    <style>{modalStyles}</style>
    <style>{modalControlStyles}</style>
  </div>;
}

const styles = `.purchases-page{display:grid;gap:16px;color:var(--text-primary)}.purchases-eyebrow{color:var(--accent-primary);font-size:10px;font-weight:800;letter-spacing:.1em}.purchases-form,.purchases-history{padding:18px;border:1px solid var(--border-color);border-radius:16px;background:var(--bg-secondary);box-shadow:var(--shadow-sm)}.purchases-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}.purchases-form label{display:grid;gap:5px;color:var(--text-secondary);font-size:12px;font-weight:700}.purchases-form input,.purchases-form select{box-sizing:border-box;width:100%;min-height:42px;padding:9px 11px;border:1px solid var(--border-color);border-radius:8px;background:var(--input-bg);color:var(--input-text);font:inherit}.purchases-section-heading{display:flex;align-items:center;justify-content:space-between;gap:10px;margin:20px 0 12px}.purchases-section-heading h2{margin:0;font-size:17px}.purchase-items{display:grid;gap:10px}.purchase-item{display:grid;grid-template-columns:1.6fr 1fr 1fr 1fr .8fr;gap:10px;padding:14px;border:1px solid var(--border-light);border-radius:10px;background:var(--bg-tertiary)}.purchase-product-field{display:grid;gap:6px;color:var(--text-secondary);font-size:12px;font-weight:700}.purchase-product-input-group{display:flex;gap:8px;align-items:stretch}.purchase-product-input-group select{flex:1;box-sizing:border-box;width:100%;min-height:42px;padding:9px 11px;border:1px solid var(--border-color);border-radius:8px;background:var(--input-bg);color:var(--input-text);font:inherit}.purchase-new-supply-button{white-space:nowrap}.purchase-calculation{grid-column:1/-1;display:flex;gap:20px;color:var(--text-secondary);font-size:12px}.purchase-calculation strong{color:var(--accent-primary)}.primary,.secondary,.danger{min-height:38px;padding:8px 12px;border-radius:8px;font-weight:700;cursor:pointer}.primary{margin-top:14px;border:0;background:var(--accent-primary);color:#fff}.secondary{border:1px solid var(--accent-border);background:var(--accent-light);color:var(--accent-primary)}.danger{border:1px solid rgba(220,38,38,.2);background:rgba(220,38,38,.08);color:var(--error-bg)}.purchases-history{display:grid;gap:10px}.purchase-history-card{border:1px solid var(--border-light);border-radius:10px;background:var(--bg-tertiary);overflow:hidden}.purchase-history-header{display:flex;align-items:center;justify-content:space-between;padding:14px 16px;cursor:pointer;gap:16px}.purchase-history-header:hover{background:var(--bg-hover)}.purchase-history-header strong{display:block;color:var(--text-primary);font-size:15px}.purchase-history-header span{color:var(--text-secondary);font-size:12px}.purchase-history-summary{display:flex;align-items:center;gap:12px;white-space:nowrap}.purchase-history-summary b{color:var(--accent-primary);font-size:16px}.expand-icon{color:var(--text-secondary);font-size:12px;transition:transform .2s ease}.purchase-history-details{padding:0 16px 16px;border-top:1px solid var(--border-light);animation:expandIn .2s ease}.purchase-items-table{width:100%;border-collapse:collapse;font-size:12px;margin-top:12px}.purchase-items-table th,.purchase-items-table td{padding:8px 10px;text-align:left;border-bottom:1px solid var(--border-light)}.purchase-items-table th{color:var(--text-secondary);font-weight:700;background:var(--bg-secondary)}.purchase-items-table td{color:var(--text-primary)}.purchase-items-table tr:last-child td{border-bottom:none}.purchase-history-footer{display:flex;flex-wrap:wrap;gap:16px;margin-top:12px;padding-top:12px;border-top:1px solid var(--border-light);color:var(--text-secondary);font-size:12px}.purchase-history-footer strong{color:var(--text-primary)}@keyframes expandIn{from{opacity:0;transform:translateY(-4px)}to{opacity:1;transform:translateY(0)}}@media(max-width:800px){.purchases-grid{grid-template-columns:repeat(2,1fr)}.purchase-item{grid-template-columns:1fr 1fr}.purchase-item label:first-child,.purchase-calculation{grid-column:1/-1}}@media(max-width:520px){.purchases-grid{grid-template-columns:1fr}.purchase-item{grid-template-columns:1fr}.purchase-item label:first-child,.purchase-calculation{grid-column:auto}.purchase-calculation{display:grid;gap:4px}.purchase-items-table{font-size:11px}.purchase-items-table th,.purchase-items-table td{padding:6px 8px}}`;

const modalStyles = `.purchase-supply-modal-backdrop{position:fixed;inset:0;z-index:20;display:grid;place-items:center;padding:16px;background:rgba(0,0,0,.48)}.purchase-supply-modal{width:min(560px,100%);max-height:90vh;overflow-y:auto;padding:20px;border:1px solid var(--border-color);border-radius:16px;background:var(--bg-secondary);color:var(--text-primary);box-shadow:var(--shadow-lg)}.purchase-supply-modal-header{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;margin-bottom:18px}.purchase-supply-modal-header h2{margin:0;color:var(--brand-brown);font:700 21px var(--font-heading)}.purchase-supply-modal-header p{margin:6px 0 0;color:var(--text-secondary);font-size:13px;line-height:1.45}.purchase-supply-close{width:36px;min-width:36px;height:36px;padding:0;border:1px solid var(--border-color);border-radius:8px;background:var(--bg-tertiary);color:var(--text-secondary);font-size:24px;line-height:1;cursor:pointer}.purchase-supply-close:hover{border-color:var(--accent-primary);color:var(--accent-primary)}.purchase-supply-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.purchase-supply-field{display:grid;gap:5px;color:var(--text-secondary);font-size:12px;font-weight:700}.purchase-supply-field.full{grid-column:1/-1}.purchase-supply-field input,.purchase-supply-field select{box-sizing:border-box;width:100%;min-height:42px;padding:9px 11px;border:1px solid var(--input-border);border-radius:8px;background:var(--input-bg);color:var(--input-text);font:inherit}.purchase-supply-note{margin-top:16px;padding:10px 12px;border:1px solid var(--warning-bg);border-left:4px solid var(--warning-bg);border-radius:8px;background:rgba(217,119,6,.08);color:var(--text-primary);font-size:12px;line-height:1.5}.purchase-supply-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:20px}.purchase-supply-actions .primary,.purchase-supply-actions .secondary{margin-top:0;min-height:42px;padding:9px 14px}@media(max-width:560px){.purchase-supply-modal-backdrop{align-items:end;padding:8px}.purchase-supply-modal{max-height:calc(100vh - 16px);padding:16px;border-radius:12px}.purchase-supply-modal-header{gap:10px;margin-bottom:14px}.purchase-supply-modal-header h2{font-size:19px}.purchase-supply-grid{grid-template-columns:1fr;gap:10px}.purchase-supply-field.full{grid-column:auto}.purchase-supply-actions{display:grid;grid-template-columns:1fr;gap:8px}.purchase-supply-actions button{width:100%}}`;

const modalControlStyles = `.purchase-supply-modal-backdrop{z-index:10000}.purchase-supply-modal,.purchase-supply-modal *{box-sizing:border-box}.purchase-supply-modal button{font-family:var(--font-body);font-size:13px;font-weight:700;line-height:1.2}.purchase-supply-modal input,.purchase-supply-modal select{min-height:44px;border:1px solid var(--input-border);border-radius:8px;outline:none;box-shadow:none}.purchase-supply-modal input:focus,.purchase-supply-modal select:focus{border-color:var(--accent-primary);box-shadow:0 0 0 3px var(--accent-light)}.purchase-supply-button{display:inline-flex;align-items:center;justify-content:center;min-height:42px;padding:10px 16px;border-radius:8px;cursor:pointer;transition:background-color .2s ease,border-color .2s ease,color .2s ease,transform .2s ease}.purchase-supply-button:active{transform:scale(.98)}.purchase-supply-button:disabled{cursor:wait;opacity:.65}.purchase-supply-button-primary{border:1px solid var(--accent-primary);background:var(--accent-primary);color:#fff}.purchase-supply-button-primary:hover{border-color:var(--accent-secondary);background:var(--accent-secondary)}.purchase-supply-button-secondary{border:1px solid var(--border-color);background:var(--bg-tertiary);color:var(--text-primary)}.purchase-supply-button-secondary:hover{border-color:var(--accent-primary);background:var(--accent-light);color:var(--accent-primary)}.purchase-supply-close{font-size:22px!important;font-weight:400!important}.purchase-supply-actions{align-items:center}.purchase-supply-actions .purchase-supply-button{margin-top:0}@media(max-width:560px){.purchase-supply-button{min-height:44px}.purchase-supply-actions{align-items:stretch}}`;

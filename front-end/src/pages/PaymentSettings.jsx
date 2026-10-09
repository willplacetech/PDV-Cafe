import { useState } from 'react';
import api from '../services/api.jsx';
import { useToast } from '../components/useToast.js';
import { useFormasPagamento } from '../context/FormasPagamentoDefinition.js';

const mesAtual = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit' }).format(new Date()).slice(0, 7);
const taxaValida = valor => String(valor).trim() !== '' && Number.isFinite(Number(valor)) && Number(valor) >= 0 && Number(valor) <= 100;

export default function PaymentSettings() {
  const { formasPagamento, recarregar, atualizarFormas, carregando, erro } = useFormasPagamento();
  const [taxas, setTaxas] = useState({});
  const [edicao, setEdicao] = useState(null);
  const [novaForma, setNovaForma] = useState({ nome: '', taxaPercentual: '0' });
  const [salvando, setSalvando] = useState('');
  const { showToast } = useToast();
  const formasComTaxa = formasPagamento.filter(forma => forma.personalizada || ['cartao_credito', 'cartao_debito'].includes(forma.value));
  const bloqueado = Boolean(salvando) || carregando || Boolean(erro);

  const adicionar = async event => {
    event.preventDefault();
    if (salvando) return;
    const nome = novaForma.nome.trim();
    if (!nome || !taxaValida(novaForma.taxaPercentual)) {
      showToast('Informe nome e taxa entre 0% e 100%.', 'warning');
      return;
    }
    try {
      setSalvando('nova');
      const { data } = await api.post('/payment-settings', { nome, taxaPercentual: Number(novaForma.taxaPercentual) });
      atualizarFormas(data.formasPagamento);
      setNovaForma({ nome: '', taxaPercentual: '0' });
      showToast('Forma de pagamento cadastrada e disponível nos recebimentos.', 'success');
    } catch (error) {
      showToast(error.response?.data?.msg || 'Não foi possível cadastrar a forma de pagamento.', 'error');
    } finally { setSalvando(''); }
  };

  const salvar = async forma => {
    if (salvando) return;
    const valor = forma.personalizada ? edicao?.taxaPercentual : taxas[forma.value] ?? forma.taxaPercentual;
    const nome = forma.personalizada ? edicao?.nome.trim() : undefined;
    if (!taxaValida(valor) || (forma.personalizada && !nome)) {
      showToast('Informe nome e taxa entre 0% e 100%.', 'warning');
      return;
    }
    try {
      setSalvando(forma.value);
      const { data } = await api.patch('/contabil/taxas-cartao', { mes: mesAtual(), tipo: forma.value, taxaPercentual: Number(valor), ...(forma.personalizada ? { nome } : {}) });
      atualizarFormas(data.formasPagamento || formasPagamento.map(atual => atual.value === forma.value ? { ...atual, taxaPercentual: Number(valor), ...(forma.personalizada ? { label: nome } : {}) } : atual));
      setTaxas(atual => { const proximo = { ...atual }; delete proximo[forma.value]; return proximo; });
      setEdicao(null);
      showToast(forma.personalizada ? 'Forma de pagamento atualizada. Taxa aplicada aos pagamentos do mês.' : 'Taxa salva e aplicada aos pagamentos do mês.', 'success');
    } catch (error) {
      showToast(error.response?.data?.msg || 'Não foi possível salvar a taxa.', 'error');
    } finally { setSalvando(''); }
  };

  const excluir = async forma => {
    if (bloqueado || !window.confirm(`Excluir a forma de pagamento "${forma.label}"? Os pagamentos já registrados serão preservados.`)) return;
    try {
      setSalvando(`excluir-${forma.value}`);
      const { data } = await api.delete(`/payment-settings/${forma.value}`);
      atualizarFormas(data.formasPagamento);
      if (edicao?.tipo === forma.value) setEdicao(null);
      showToast('Forma de pagamento excluída.', 'success');
    } catch (error) {
      showToast(error.response?.data?.msg || 'Não foi possível excluir a forma de pagamento.', 'error');
    } finally { setSalvando(''); }
  };

  return <main className="payment-settings-page">
    <header className="page-heading"><div><span>CONFIGURAÇÕES</span><h1>Formas de pagamento</h1><p>Cadastre formas como Vale Refeição e configure suas taxas. Alterações de taxa são aplicadas aos recebimentos do mês atual.</p></div></header>
    {erro && <p role="alert">{erro} <button type="button" onClick={() => void recarregar()}>Tentar novamente</button></p>}
    {carregando && <p role="status">Carregando formas de pagamento...</p>}
    <form className="payment-settings-new" onSubmit={adicionar}>
      <h2>Nova forma de pagamento</h2>
      <label>Nome<input maxLength={80} required placeholder="Nome da forma de pagamento" value={novaForma.nome} disabled={Boolean(salvando)} onChange={event => setNovaForma(atual => ({ ...atual, nome: event.target.value }))} /></label>
      <label>Taxa (%)<input type="number" min="0" max="100" step="0.01" required aria-label="Taxa da nova forma de pagamento" value={novaForma.taxaPercentual} disabled={Boolean(salvando)} onChange={event => setNovaForma(atual => ({ ...atual, taxaPercentual: event.target.value }))} /></label>
      <button type="submit" disabled={Boolean(salvando) || carregando || Boolean(erro)}>{salvando === 'nova' ? 'Adicionando...' : 'Adicionar forma de pagamento'}</button>
    </form>
    <section className="payment-settings-grid" aria-label="Taxas das formas de pagamento">
      {formasComTaxa.map(forma => <article key={forma.value}>
        <h2>{forma.label}</h2>
        {forma.personalizada ? edicao?.tipo === forma.value ? <form className="payment-settings-edit" onSubmit={event => { event.preventDefault(); void salvar(forma); }}>
          <label htmlFor={`nome-${forma.value}`}>Nome</label>
          <input id={`nome-${forma.value}`} type="text" maxLength={80} required autoFocus value={edicao.nome} disabled={bloqueado} onChange={event => setEdicao(atual => ({ ...atual, nome: event.target.value }))} />
          <label htmlFor={`taxa-${forma.value}`}>Taxa (%)</label>
          <input id={`taxa-${forma.value}`} type="number" min="0" max="100" step="0.01" required value={edicao.taxaPercentual} disabled={bloqueado} onChange={event => setEdicao(atual => ({ ...atual, taxaPercentual: event.target.value }))} />
          <div className="payment-settings-actions">
            <button type="submit" disabled={bloqueado}>{salvando === forma.value ? 'Salvando...' : 'Salvar alterações'}</button>
            <button type="button" className="payment-settings-secondary" disabled={bloqueado} onClick={() => setEdicao(null)}>Cancelar</button>
          </div>
        </form> : <>
          <p className="payment-settings-rate">Taxa: <strong>{forma.taxaPercentual}%</strong></p>
          <div className="payment-settings-actions">
            <button type="button" disabled={bloqueado} onClick={() => setEdicao({ tipo: forma.value, nome: forma.label, taxaPercentual: String(forma.taxaPercentual) })}>Editar</button>
            <button type="button" className="payment-settings-danger" disabled={bloqueado} onClick={() => void excluir(forma)}>{salvando === `excluir-${forma.value}` ? 'Excluindo...' : 'Excluir'}</button>
          </div>
        </> : <>
          <label htmlFor={`taxa-${forma.value}`}>Taxa (%)</label>
          <div><input id={`taxa-${forma.value}`} type="number" min="0" max="100" step="0.01" disabled={bloqueado} value={taxas[forma.value] ?? forma.taxaPercentual} onChange={event => setTaxas(atual => ({ ...atual, [forma.value]: event.target.value }))} aria-label={`Taxa de ${forma.label}`} /><span>%</span></div>
          <button type="button" onClick={() => void salvar(forma)} disabled={bloqueado}>{salvando === forma.value ? 'Salvando...' : 'Salvar taxa'}</button>
        </>}
      </article>)}
    </section>
    <style>{`
      .payment-settings-page{max-width:960px;margin:0 auto;padding:8px 0 32px;color:var(--text-primary)}
      .payment-settings-page .page-heading>div>span{font-size:10px;font-weight:800;letter-spacing:.1em;color:var(--accent-primary)}
      .payment-settings-page .page-heading h1{margin:5px 0}.payment-settings-page .page-heading p{color:var(--text-secondary);font-size:13px}
      .payment-settings-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px;margin-top:18px}
      .payment-settings-grid article,.payment-settings-new{display:grid;gap:12px;padding:20px;border:1px solid var(--border-color);border-radius:16px;background:var(--bg-secondary);box-shadow:var(--shadow-sm)}
      .payment-settings-new{grid-template-columns:2fr 1fr auto;margin-top:18px;align-items:end}.payment-settings-new h2{grid-column:1/-1;margin:0;font-size:16px}
      .payment-settings-new label{display:grid;gap:8px}.payment-settings-grid label{font-weight:800}.payment-settings-grid article>div{display:flex;align-items:center;gap:8px}
      .payment-settings-page input{width:100%;box-sizing:border-box;min-height:46px;padding:10px;border:1px solid var(--border-color);border-radius:9px;background:var(--input-bg);color:var(--input-text);font:inherit}
      .payment-settings-page button{min-height:44px;padding:10px;border:0;border-radius:9px;background:var(--accent-primary);color:#fff;font:inherit;font-weight:800;cursor:pointer}
      .payment-settings-page button:disabled{opacity:.6;cursor:wait}
      .payment-settings-grid article{align-content:start}.payment-settings-grid h2{margin:0;font-size:16px}
      .payment-settings-edit{display:grid;gap:8px}.payment-settings-rate{margin:0;color:var(--text-secondary)}
      .payment-settings-actions{display:flex;gap:8px;flex-wrap:wrap}.payment-settings-actions button{flex:1}
      .payment-settings-page .payment-settings-secondary{background:var(--bg-tertiary);color:var(--text-primary);border:1px solid var(--border-color)}
      .payment-settings-page .payment-settings-danger{background:rgba(239,68,68,.1);color:var(--error-bg);border:1px solid rgba(239,68,68,.2)}
      @media(max-width:600px){.payment-settings-grid,.payment-settings-new{grid-template-columns:1fr}}
    `}</style>
  </main>;
}

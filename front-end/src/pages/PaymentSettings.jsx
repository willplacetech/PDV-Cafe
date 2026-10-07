import { useEffect, useState } from 'react';
import api from '../services/api.jsx';
import { useToast } from '../components/useToast.js';

const formas = [
  { tipo: 'cartao_credito', titulo: 'Cartão de crédito' },
  { tipo: 'cartao_debito', titulo: 'Cartão de débito' },
];

export default function PaymentSettings() {
  const [taxas, setTaxas] = useState({ cartao_credito: '', cartao_debito: '' });
  const [salvando, setSalvando] = useState('');
  const { showToast } = useToast();

  useEffect(() => {
    api.get('/dashboard')
      .then(({ data }) => {
        const configuradas = data.taxasCartao || {};
        setTaxas({
          cartao_credito: configuradas.cartao_credito ?? '',
          cartao_debito: configuradas.cartao_debito ?? '',
        });
      })
      .catch(error => showToast(error.response?.data?.msg || 'Não foi possível carregar as taxas de pagamento.', 'error'));
  }, [showToast]);

  const salvar = async tipo => {
    const taxaPercentual = Number(taxas[tipo]);
    if (!Number.isFinite(taxaPercentual) || taxaPercentual < 0) {
      showToast('Informe uma taxa percentual válida.', 'warning');
      return;
    }
    try {
      setSalvando(tipo);
      await api.patch('/contabil/taxas-cartao', { mes: new Date().toISOString().slice(0, 7), tipo, taxaPercentual });
      showToast('Taxa salva e aplicada aos pagamentos do mês.', 'success');
    } catch (error) {
      showToast(error.response?.data?.msg || 'Não foi possível salvar a taxa.', 'error');
    } finally {
      setSalvando('');
    }
  };

  return <main className="payment-settings-page">
    <header className="page-heading"><div><span>CONFIGURAÇÕES</span><h1>Taxas de cartão</h1><p>As taxas ficam definidas até serem alteradas e são aplicadas aos pagamentos do mês.</p></div></header>
    <section className="payment-settings-grid">
      {formas.map(forma => <article key={forma.tipo}>
        <label htmlFor={`taxa-${forma.tipo}`}>{forma.titulo}</label>
        <div><input id={`taxa-${forma.tipo}`} type="number" min="0" step="0.01" value={taxas[forma.tipo]} onChange={event => setTaxas(atual => ({ ...atual, [forma.tipo]: event.target.value }))} aria-label={`Taxa do ${forma.titulo}`} /><span>%</span></div>
        <button type="button" onClick={() => salvar(forma.tipo)} disabled={Boolean(salvando)}>{salvando === forma.tipo ? 'Salvando...' : 'Salvar taxa'}</button>
      </article>)}
    </section>
    <style>{`
      .payment-settings-page{max-width:960px;margin:0 auto;padding:8px 0 32px;color:var(--text-primary)}
      .payment-settings-page .page-heading>div>span{font-size:10px;font-weight:800;letter-spacing:.1em;color:var(--accent-primary)}
      .payment-settings-page .page-heading h1{margin:5px 0}.payment-settings-page .page-heading p{color:var(--text-secondary);font-size:13px}
      .payment-settings-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px;margin-top:18px}
      .payment-settings-grid article{display:grid;gap:12px;padding:20px;border:1px solid var(--border-color);border-radius:16px;background:var(--bg-secondary);box-shadow:var(--shadow-sm)}
      .payment-settings-grid label{font-weight:800}.payment-settings-grid article>div{display:flex;align-items:center;gap:8px}
      .payment-settings-grid input{width:100%;min-height:46px;padding:10px;border:1px solid var(--border-color);border-radius:9px;background:var(--input-bg);color:var(--input-text);font:inherit}
      .payment-settings-grid button{min-height:44px;border:0;border-radius:9px;background:var(--accent-primary);color:#fff;font:inherit;font-weight:800;cursor:pointer}
      .payment-settings-grid button:disabled{opacity:.6;cursor:wait}
      @media(max-width:600px){.payment-settings-grid{grid-template-columns:1fr}}
    `}</style>
  </main>;
}

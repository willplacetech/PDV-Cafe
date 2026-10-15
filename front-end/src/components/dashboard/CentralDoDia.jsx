import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../../services/api.jsx';
import { useToast } from '../useToast.js';
import AlertasModal from './AlertasModal.jsx';

const dinheiro = (valor) => `R$ ${Number(valor || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const mensagemCobranca = (nome) => `Olá${nome ? `, ${nome}` : ''}! Passando para lembrar sobre o saldo pendente que consta aqui. Quando puder, entre em contato para combinarmos o pagamento. Obrigado!`;

export default function CentralDoDia() {
  const [dados, setDados] = useState(null);
  const [erro, setErro] = useState('');
  const [reporProduto, setReporProduto] = useState(null);
  const [alertasOpen, setAlertasOpen] = useState(false);
  const [quantidade, setQuantidade] = useState('');
  const [salvando, setSalvando] = useState(false);
  const { showToast } = useToast();

  const carregar = useCallback(() => {
    return Promise.all([
      api.get('/dashboard/urgencias'),
      api.get('/estoque/baixo', { params: { limite: 5 } }),
      api.get('/contas-receber/resumo'),
      api.get('/despesas/central-resumo'),
    ]).then(([urgencias, estoque, recebiveis, despesas]) => {
      setErro('');
      setDados({
        urgencias: urgencias.data || [],
        estoque: estoque.data || [],
        totalEstoque: Number(estoque.headers['x-total-count'] || estoque.data?.length || 0),
        recebiveis: recebiveis.data,
        despesas: despesas.data,
      });
    }).catch((error) => {
      setErro(error.response?.data?.msg || 'Não foi possível carregar a Central do Dia.');
    });
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const salvarReposicao = async (event) => {
    event.preventDefault();
    const adicional = Number(quantidade);
    if (!reporProduto || !Number.isFinite(adicional) || adicional <= 0) {
      showToast('Informe uma quantidade maior que zero.', 'warning');
      return;
    }
    try {
      setSalvando(true);
      const estoqueAtualizado = reporProduto.estoqueReposicao + adicional;
      const atualizacao = reporProduto.tipoReposicao === 'peso'
        ? { estoquePesoKg: estoqueAtualizado }
        : { estoque: estoqueAtualizado };
      await api.put(`/products/${reporProduto.id}`, atualizacao);
      showToast('Estoque atualizado.', 'success');
      setReporProduto(null);
      setQuantidade('');
      await carregar();
    } catch (error) {
      showToast(error.response?.data?.msg || error.response?.data?.error || 'Não foi possível atualizar o estoque.', 'error');
    } finally {
      setSalvando(false);
    }
  };

  if (erro) return <section className="day-center day-center-error" aria-labelledby="day-center-title">
    <div><span className="dashboard-eyebrow">GESTÃO OPERACIONAL</span><h2 id="day-center-title">Central do Dia</h2><p role="alert">{erro}</p></div>
    <button type="button" onClick={() => { setErro(''); void carregar(); }}>Tentar novamente</button>
    <style>{estilos}</style>
  </section>;

  if (!dados) return <section className="day-center" aria-labelledby="day-center-title"><p role="status">Carregando Central do Dia...</p><style>{estilos}</style></section>;

  const resumoReceber = dados.recebiveis || {};
  const resumoDespesas = dados.despesas || {};
  const totalReceber = Number(resumoReceber.total || 0);
  const porWhatsApp = (devedor) => {
    const telefone = String(devedor.telefone || '').replace(/\D/g, '');
    if (!telefone) return null;
    const telefoneCompleto = telefone.startsWith('55') ? telefone : `55${telefone}`;
    return `https://wa.me/${telefoneCompleto}?text=${encodeURIComponent(mensagemCobranca(devedor.nome))}`;
  };

  return <section className="day-center" aria-labelledby="day-center-title">
    <header className="day-center-heading"><div><span className="dashboard-eyebrow">GESTÃO OPERACIONAL</span><h2 id="day-center-title">Central do Dia</h2><p>Ações que merecem atenção agora.</p></div></header>
    <div className="day-center-columns">
      <article className="day-center-card">
        <h3>⚠️ Urgências do Dia <span>{dados.urgencias.length}</span></h3>
        {dados.urgencias.length ? <ul className="day-urgency-list">
          {dados.urgencias.slice(0, 8).map((item, index) => <li className={`urgency-${item.severidade}`} key={`${item.tipo}-${item.titulo}-${index}`}>
            <i aria-hidden="true" /><Link to={item.link || '/dashboard'}><strong>{item.titulo}</strong><small>{item.valor ? dinheiro(item.valor) : item.subtitulo}</small></Link>
          </li>)}
          {dados.urgencias.length > 8 && <li><button type="button" className="day-alerts-trigger" onClick={() => setAlertasOpen(true)}>Ver mais {dados.urgencias.length - 8} alertas</button></li>}
        </ul> : <p className="day-center-clear">✓ Tudo em dia — nenhuma ação pendente.</p>}
      </article>

      <article className="day-center-card">
        <h3>📦 Estoque baixo <span>{dados.totalEstoque}</span></h3>
        {dados.estoque.length ? <ul className="day-stock-list">
          {dados.estoque.map((produto) => <li key={produto.id} className={Number(produto.qtdAtual) <= 0 ? 'stock-empty' : ''}>
            <span><strong>{produto.nome}</strong><small>{Number(produto.qtdAtual).toLocaleString('pt-BR')} {produto.unidade} · mínimo {Number(produto.minimo).toLocaleString('pt-BR')} {produto.unidade}</small></span>
            <button type="button" onClick={() => { setReporProduto(produto); setQuantidade(''); }}>Repor</button>
          </li>)}
        </ul> : <p className="day-center-clear">✓ Nenhum produto abaixo do mínimo.</p>}
        <Link className="day-center-footer" to="/produtos?filtro=estoque-baixo">Ver todos ({dados.totalEstoque}) →</Link>
      </article>

      <article className="day-center-card day-receivables">
        <h3>💰 Contas a Receber</h3>
        <div className="day-receivable-stats">
          <div><small>Total a receber</small><strong>{dinheiro(totalReceber)}</strong><span>saldo sem vencimento registrado</span></div>
        </div>
        <h4>Maiores saldos de clientes</h4>
        {resumoReceber.topDevedores?.length ? <ul className="day-debtor-list">{resumoReceber.topDevedores.map((devedor, index) => <li key={`${devedor.nome}-${index}`}>
          <span><strong>{devedor.nome}</strong><small>{dinheiro(devedor.valor)}</small></span>
          {porWhatsApp(devedor) && <a href={porWhatsApp(devedor)} target="_blank" rel="noreferrer">Cobrar no WhatsApp</a>}
        </li>)}</ul> : <p className="day-center-clear">Nenhum saldo pendente de clientes.</p>}
        <Link className="day-center-footer" to="/contas-receber">Gerir contas →</Link>
      </article>

      <article className="day-center-card day-payables">
        <h3>🧾 Contas a Pagar</h3>
        <div className="day-receivable-stats">
          <div><small>Vencem hoje</small><strong>{dinheiro(resumoDespesas.vencemHoje?.valor)}</strong><span>{resumoDespesas.vencemHoje?.count || 0} conta(s) a pagar</span></div>
          <div><small>Semana atual (seg. a dom.)</small><strong>{dinheiro(resumoDespesas.vencemSemana?.valor)}</strong><span>{resumoDespesas.vencemSemana?.count || 0} conta(s) com vencimento nesta semana</span></div>
          <div className={Number(resumoDespesas.atrasadas?.count) ? 'receivable-late' : ''}><small>Em atraso</small><strong>{dinheiro(resumoDespesas.atrasadas?.valor)}</strong><span>{resumoDespesas.atrasadas?.count || 0} conta(s) a pagar</span></div>
        </div>
        <Link className="day-center-footer" to="/financeiro">Gerir contas a pagar →</Link>
      </article>
    </div>
    {alertasOpen && <AlertasModal alertas={dados.urgencias} onClose={() => setAlertasOpen(false)} />}
    {reporProduto && <div className="day-replenish-overlay" onClick={() => setReporProduto(null)}>
      <form className="day-replenish-modal" onSubmit={salvarReposicao} onClick={(event) => event.stopPropagation()}>
        <h3>Repor estoque</h3><p>{reporProduto.nome} · atual: {Number(reporProduto.estoqueReposicao).toLocaleString('pt-BR')} {reporProduto.unidadeReposicao}</p>
        <label htmlFor="day-replenish-quantity">Quantidade a adicionar ({reporProduto.unidadeReposicao})</label>
        <input id="day-replenish-quantity" type="number" min="0.001" step="any" value={quantidade} onChange={(event) => setQuantidade(event.target.value)} autoFocus required />
        <div><button type="button" onClick={() => setReporProduto(null)} disabled={salvando}>Cancelar</button><button type="submit" disabled={salvando}>{salvando ? 'Salvando...' : 'Atualizar estoque'}</button></div>
      </form>
    </div>}
    <style>{estilos}</style>
  </section>;
}

const estilos = `
  .day-center{margin:0 0 18px;padding:18px;border:1px solid var(--border-color);border-radius:16px;background:var(--bg-secondary);box-shadow:var(--shadow-sm);color:var(--text-primary)}
  .day-center-heading{display:flex;align-items:center;justify-content:space-between;margin-bottom:14px}
  .day-center-heading h2{margin:4px 0;font-size:20px}.day-center-heading p{margin:0;color:var(--text-secondary);font-size:12px}
  .day-center-columns{display:grid;grid-template-columns:1.1fr 1fr 1.2fr 1.2fr;gap:12px}
  .day-center-card{min-width:0;padding:14px;border:1px solid var(--border-light);border-radius:12px;background:var(--bg-primary)}
  .day-center-card h3{display:flex;align-items:center;gap:7px;margin:0 0 12px;font-size:14px}.day-center-card h3 span{display:grid;place-items:center;min-width:21px;height:21px;padding:0 5px;border-radius:12px;background:var(--bg-tertiary);font-size:10px}
  .day-urgency-list,.day-stock-list,.day-debtor-list{display:grid;gap:7px;margin:0;padding:0;list-style:none}
  .day-urgency-list li{display:flex;align-items:flex-start;gap:8px;padding:7px 0;border-bottom:1px solid var(--border-light)}
  .day-urgency-list i{flex:0 0 8px;width:8px;height:8px;margin-top:4px;border-radius:50%;background:#4389c8}
  .day-urgency-list .urgency-atrasado i{background:#c94637}.day-urgency-list .urgency-hoje i{background:#d89420}
  .day-urgency-list a,.day-urgency-list li>a{display:grid;gap:3px;color:var(--text-primary);font-size:11px;text-decoration:none}.day-urgency-list a:hover strong{text-decoration:underline}
  .day-urgency-list small,.day-stock-list small,.day-debtor-list small{color:var(--text-secondary);font-size:10px}
  .day-alerts-trigger{min-height:44px;padding:8px 10px;border:1px solid var(--accent-border);border-radius:8px;background:var(--accent-light);color:var(--accent-primary);font:inherit;font-size:12px;font-weight:700;cursor:pointer}
  .day-stock-list li,.day-debtor-list li{display:flex;align-items:center;justify-content:space-between;gap:7px;padding:7px 0;border-bottom:1px solid var(--border-light)}
  .day-stock-list li>span,.day-debtor-list li>span{display:grid;gap:3px;overflow:hidden}.day-stock-list strong,.day-debtor-list strong{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:11px}
  .day-stock-list .stock-empty strong,.day-stock-list .stock-empty small{color:var(--error-text,#b42318)}
  .day-stock-list button,.day-debtor-list a{flex:0 0 auto;padding:6px 8px;border:1px solid var(--accent-border);border-radius:7px;background:var(--accent-light);color:var(--accent-primary);font:inherit;font-size:10px;font-weight:700;text-decoration:none;cursor:pointer}
  .day-center-footer{display:block;margin-top:10px;color:var(--accent-primary);font-size:11px;font-weight:800;text-decoration:none}
  .day-center-clear{margin:8px 0;color:var(--success-bg,#287a4b);font-size:11px}
  .day-receivable-stats{display:grid;gap:7px}.day-receivable-stats>div{display:grid;grid-template-columns:1fr auto;gap:2px 8px;padding-bottom:7px;border-bottom:1px solid var(--border-light)}
  .day-receivable-stats small{color:var(--text-secondary);font-size:10px}.day-receivable-stats strong{font-size:12px}.day-receivable-stats span{grid-column:1/-1;color:var(--text-secondary);font-size:9px}
  .day-receivable-stats .receivable-late strong{color:var(--error-text,#b42318)}
  .day-receivables h4{margin:12px 0 5px;font-size:11px}.day-debtor-list a{font-size:9px}
  .day-center-error{display:flex;align-items:center;justify-content:space-between;gap:12px}.day-center-error p[role=alert]{color:var(--error-text,#b42318);font-size:12px}
  .day-center-error>button,.day-replenish-modal button{min-height:36px;padding:8px 12px;border:1px solid var(--border-color);border-radius:8px;background:var(--bg-tertiary);color:var(--text-primary);font:inherit;font-weight:700;cursor:pointer}
  .day-replenish-overlay{position:fixed;z-index:1000;inset:0;display:grid;place-items:center;padding:16px;background:rgba(25,20,16,.58)}
  .day-replenish-modal{display:grid;gap:10px;width:min(100%,400px);padding:22px;border:1px solid var(--border-color);border-radius:16px;background:var(--bg-secondary);color:var(--text-primary);box-shadow:var(--shadow-lg)}
  .day-replenish-modal h3,.day-replenish-modal p{margin:0}.day-replenish-modal p,.day-replenish-modal label{color:var(--text-secondary);font-size:12px}
  .day-replenish-modal input{min-height:42px;padding:9px;border:1px solid var(--border-color);border-radius:8px;background:var(--input-bg);color:var(--input-text);font:inherit}
  .day-replenish-modal>div{display:flex;justify-content:flex-end;gap:8px;margin-top:6px}.day-replenish-modal button[type=submit]{border-color:var(--accent-primary);background:var(--accent-primary);color:#fff}
  @media(max-width:1050px){.day-center-columns{grid-template-columns:1fr 1fr}}
  @media(max-width:640px){.day-center{padding:13px}.day-center-columns{grid-template-columns:1fr}.day-center-error{align-items:flex-start;flex-direction:column}.day-center-error>button{width:100%}}
`;

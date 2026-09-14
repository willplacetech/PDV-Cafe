import { useEffect, useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import api from '../services/api.jsx';
import { useToast } from '../components/Toast.jsx';

const money = (value) => `R$ ${Number(value || 0).toFixed(2).replace('.', ',')}`;
const statusColors = { pago: '#1f9d57', pendente: '#d97706', atrasado: '#dc2626' };

export default function Financeiro() {
  const [user, setUser] = useState(() => JSON.parse(localStorage.getItem('pdv_user') || 'null'));
  const [tab, setTab] = useState('despesas');
  const [despesas, setDespesas] = useState([]);
  const [resumo, setResumo] = useState({ totalPendente: 0, totalPago: 0, totalAtrasado: 0, porCategoria: [] });
  const [fluxo, setFluxo] = useState({ dados: [], totalEntradas: 0, totalSaidas: 0, saldoDoMes: 0 });
  const [dre, setDre] = useState({ receitaBruta: 0, cmv: 0, lucroBruto: 0, despesasOperacionais: 0, ebit: 0, depreciacaoAmortizacao: 0, ebitda: 0, impostosEstimados: 0, lucroLiquido: 0, margemBruta: 0, margemLiquida: 0, despesasPorCategoria: {}, produtosSemCusto: [] });
  const [mesSelecionado, setMesSelecionado] = useState(new Date().toISOString().slice(0, 7));
  const [filtro, setFiltro] = useState({ status: '', categoria: '', dataInicio: '', dataFim: '' });
  const [form, setForm] = useState({ descricao: '', categoria: 'Outros', fornecedor: '', valor: '', dataVencimento: '', recorrente: false });
  const { showToast } = useToast();

  useEffect(() => {
    if (!user || user.role !== 'admin') return;
    const load = async () => {
      try {
        const [despesasRes, resumoRes, fluxoRes, dreRes] = await Promise.all([
          api.get('/despesas'),
          api.get('/despesas/resumo', { params: { mes: mesSelecionado } }),
          api.get('/contabil/fluxo-caixa', { params: { mes: mesSelecionado } }),
          api.get('/contabil/dre', { params: { mes: mesSelecionado } }),
        ]);
        setDespesas(despesasRes.data || []);
        setResumo(resumoRes.data || { totalPendente: 0, totalPago: 0, totalAtrasado: 0, porCategoria: [] });
        setFluxo(fluxoRes.data || { dados: [], totalEntradas: 0, totalSaidas: 0, saldoDoMes: 0 });
        setDre(dreRes.data || { receitaBruta: 0, cmv: 0, lucroBruto: 0, despesasOperacionais: 0, ebit: 0, depreciacaoAmortizacao: 0, ebitda: 0, impostosEstimados: 0, lucroLiquido: 0, margemBruta: 0, margemLiquida: 0, despesasPorCategoria: {}, produtosSemCusto: [] });
      } catch (error) {
        showToast(error.response?.data?.msg || 'Não foi possível carregar o financeiro', 'error');
      }
    };
    load();
  }, [mesSelecionado, showToast, user]);

  const despesasFiltradas = useMemo(() => despesas.filter((despesa) => {
    const matchesStatus = !filtro.status || despesa.status === filtro.status;
    const matchesCategoria = !filtro.categoria || despesa.categoria === filtro.categoria;
    const matchesInicio = !filtro.dataInicio || new Date(despesa.dataVencimento) >= new Date(`${filtro.dataInicio}T00:00:00`);
    const matchesFim = !filtro.dataFim || new Date(despesa.dataVencimento) <= new Date(`${filtro.dataFim}T23:59:59`);
    return matchesStatus && matchesCategoria && matchesInicio && matchesFim;
  }), [despesas, filtro]);

  if (!user || user.role !== 'admin') return <Navigate to="/pdv" replace />;

  const salvarDespesa = async (event) => {
    event.preventDefault();
    try {
      await api.post('/despesas', { ...form, valor: Number(form.valor), dataVencimento: form.dataVencimento || new Date().toISOString() });
      setForm({ descricao: '', categoria: 'Outros', fornecedor: '', valor: '', dataVencimento: '', recorrente: false });
      const response = await api.get('/despesas');
      setDespesas(response.data);
      showToast('Despesa cadastrada com sucesso', 'success');
    } catch (error) {
      showToast(error.response?.data?.msg || 'Não foi possível salvar a despesa', 'error');
    }
  };

  const marcarPago = async (id) => {
    try {
      await api.put(`/despesas/${id}/pagar`);
      const response = await api.get('/despesas');
      setDespesas(response.data);
      showToast('Despesa marcada como paga', 'success');
    } catch (error) {
      showToast(error.response?.data?.msg || 'Não foi possível marcar como pago', 'error');
    }
  };

  const exportarCsv = () => {
    const linhas = [
      ['Receita Bruta', dre.receitaBruta],
      ['CMV', dre.cmv],
      ['Lucro Bruto', dre.lucroBruto],
      ['Despesas Operacionais', dre.despesasOperacionais],
      ['EBIT', dre.ebit],
      ['Depreciação/Amortização', dre.depreciacaoAmortizacao],
      ['EBITDA', dre.ebitda],
      ['Impostos', dre.impostosEstimados],
      ['Lucro Líquido', dre.lucroLiquido],
    ];
    const blob = new Blob([linhas.map((linha) => linha.join(';')).join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `dre-${mesSelecionado}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return <div className="financeiro-page">
    <header className="financeiro-header page-heading"><div><span className="financeiro-eyebrow">MÓDULO FINANCEIRO</span><h1>Financeiro</h1><p>Contas a pagar, fluxo de caixa e DRE/EBITDA.</p></div><div className="financeiro-period"><label>Mês<input type="month" value={mesSelecionado} onChange={(event) => setMesSelecionado(event.target.value)} /></label></div></header>

    <nav className="financeiro-tabs">
      {[['despesas', 'Contas a Pagar'], ['fluxo', 'Fluxo de Caixa'], ['dre', 'DRE / EBITDA']].map(([key, label]) => <button key={key} className={tab === key ? 'active' : ''} onClick={() => setTab(key)}>{label}</button>)}
    </nav>

    {tab === 'despesas' && <div>
      <div className="financeiro-kpis">
        <div className="financeiro-kpi"><span>Total Pago no mês</span><strong>{money(resumo.totalPago)}</strong></div>
        <div className="financeiro-kpi"><span>Total Pendente</span><strong>{money(resumo.totalPendente)}</strong></div>
        <div className="financeiro-kpi"><span>Total Atrasado</span><strong>{money(resumo.totalAtrasado)}</strong></div>
      </div>

      <section className="financeiro-panel">
        <div className="financeiro-section-header"><h2>Despesas</h2><button className="primary-button" onClick={() => { document.getElementById('nova-despesa')?.scrollIntoView({ behavior: 'smooth' }); }}>Nova Despesa</button></div>
        <div className="filters-grid">
          <label>Status<select value={filtro.status} onChange={(event) => setFiltro({ ...filtro, status: event.target.value })}><option value="">Todos</option><option value="pendente">Pendente</option><option value="pago">Pago</option><option value="atrasado">Atrasado</option></select></label>
          <label>Categoria<select value={filtro.categoria} onChange={(event) => setFiltro({ ...filtro, categoria: event.target.value })}><option value="">Todas</option>{['Aluguel', 'Energia', 'Água', 'Internet', 'Fornecedores/Insumos', 'Salários/Pró-labore', 'Impostos', 'Marketing', 'Manutenção', 'Transporte', 'Outros'].map((categoria) => <option key={categoria} value={categoria}>{categoria}</option>)}</select></label>
          <label>De<input type="date" value={filtro.dataInicio} onChange={(event) => setFiltro({ ...filtro, dataInicio: event.target.value })} /></label>
          <label>Até<input type="date" value={filtro.dataFim} onChange={(event) => setFiltro({ ...filtro, dataFim: event.target.value })} /></label>
        </div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Descrição</th><th>Categoria</th><th>Valor</th><th>Vencimento</th><th>Status</th><th>Ação</th></tr></thead>
            <tbody>
              {despesasFiltradas.map((item) => <tr key={item._id}><td>{item.descricao}</td><td>{item.categoria}</td><td>{money(item.valor)}</td><td>{new Date(item.dataVencimento).toLocaleDateString('pt-BR')}</td><td><span className="status-pill" style={{ background: `${statusColors[item.status] || '#6b7280'}22`, color: statusColors[item.status] || '#6b7280' }}>{item.status}</span></td><td>{item.status !== 'pago' ? <button className="secondary-button" onClick={() => marcarPago(item._id)}>Marcar Pago</button> : '—'}</td></tr>)}
            </tbody>
          </table>
        </div>
      </section>

      <section className="financeiro-panel" id="nova-despesa"><h2>Nova despesa</h2><form className="form-grid" onSubmit={salvarDespesa}><label>Descrição<input value={form.descricao} onChange={(event) => setForm({ ...form, descricao: event.target.value })} required /></label><label>Categoria<select value={form.categoria} onChange={(event) => setForm({ ...form, categoria: event.target.value })}>{['Aluguel', 'Energia', 'Água', 'Internet', 'Fornecedores/Insumos', 'Salários/Pró-labore', 'Impostos', 'Marketing', 'Manutenção', 'Transporte', 'Outros'].map((categoria) => <option key={categoria}>{categoria}</option>)}</select></label><label>Fornecedor<input value={form.fornecedor} onChange={(event) => setForm({ ...form, fornecedor: event.target.value })} /></label><label>Valor<input type="number" step="0.01" value={form.valor} onChange={(event) => setForm({ ...form, valor: event.target.value })} required /></label><label>Vencimento<input type="date" value={form.dataVencimento} onChange={(event) => setForm({ ...form, dataVencimento: event.target.value })} required /></label><label className="checkbox-row"><input type="checkbox" checked={form.recorrente} onChange={(event) => setForm({ ...form, recorrente: event.target.checked })} /> Despesa recorrente</label><button className="primary-button" type="submit">Salvar</button></form></section>
    </div>}

    {tab === 'fluxo' && <div>
      <div className="financeiro-kpis">
        <div className="financeiro-kpi"><span>Total Entradas</span><strong>{money(fluxo.totalEntradas)}</strong></div>
        <div className="financeiro-kpi"><span>Total Saídas</span><strong>{money(fluxo.totalSaidas)}</strong></div>
        <div className="financeiro-kpi"><span>Saldo do Mês</span><strong>{money(fluxo.saldoDoMes)}</strong></div>
      </div>
      <section className="financeiro-panel">
        <div className="chart-box">{fluxo.dados.length ? <div className="bar-chart">{fluxo.dados.map((dia) => <div key={dia.data} className="bar-column"><span className="bar-entrada" style={{ height: `${Math.max(10, (dia.entradas / Math.max(fluxo.totalEntradas, 1)) * 100)}%` }} /><span className="bar-saida" style={{ height: `${Math.max(10, (dia.saidas / Math.max(fluxo.totalSaidas, 1)) * 100)}%` }} /><small>{new Date(`${dia.data}T12:00:00`).getDate()}</small><strong>{money(dia.saldoAcumulado)}</strong></div>)}</div> : <p>Nenhum dado para este mês.</p>}</div>
      </section>
    </div>}

    {tab === 'dre' && <div>
      <div className="financeiro-panel">
        <div className="financeiro-section-header"><h2>Demonstativo</h2><button className="primary-button" onClick={exportarCsv}>Imprimir / Exportar CSV</button></div>
        <table className="dre-table">
          <tbody>
            <tr><th>Receita Bruta</th><td>{money(dre.receitaBruta)}</td><td>100%</td></tr>
            <tr><th>− CMV</th><td>{money(dre.cmv)}</td><td>{dre.receitaBruta ? `${((dre.cmv / dre.receitaBruta) * 100).toFixed(1)}%` : '0%'}</td></tr>
            <tr><th>= Lucro Bruto</th><td>{money(dre.lucroBruto)}</td><td>{dre.receitaBruta ? `${((dre.lucroBruto / dre.receitaBruta) * 100).toFixed(1)}%` : '0%'}</td></tr>
            {Object.entries(dre.despesasPorCategoria || {}).map(([categoria, valor]) => <tr key={categoria}><th>− {categoria}</th><td>{money(valor)}</td><td>{dre.receitaBruta ? `${((valor / dre.receitaBruta) * 100).toFixed(1)}%` : '0%'}</td></tr>)}
            <tr><th>= EBIT</th><td>{money(dre.ebit)}</td><td>{dre.receitaBruta ? `${((dre.ebit / dre.receitaBruta) * 100).toFixed(1)}%` : '0%'}</td></tr>
            <tr><th>+ Depreciação/Amortização</th><td>{money(dre.depreciacaoAmortizacao)}</td><td>—</td></tr>
            <tr><th>= EBITDA</th><td>{money(dre.ebitda)}</td><td>{dre.receitaBruta ? `${((dre.ebitda / dre.receitaBruta) * 100).toFixed(1)}%` : '0%'}</td></tr>
            <tr><th>− Impostos</th><td>{money(dre.impostosEstimados)}</td><td>—</td></tr>
            <tr><th>= Lucro Líquido</th><td>{money(dre.lucroLiquido)}</td><td>{dre.receitaBruta ? `${((dre.lucroLiquido / dre.receitaBruta) * 100).toFixed(1)}%` : '0%'}</td></tr>
          </tbody>
        </table>
      </div>
      {dre.produtosSemCusto?.length > 0 && <div className="financeiro-panel warning-panel"><h3>Produtos sem custo cadastrado</h3><ul>{dre.produtosSemCusto.map((nome) => <li key={nome}>{nome}</li>)}</ul></div>}
    </div>}

    <style>{` 
      .financeiro-page { color: var(--text-primary); }
      .financeiro-header { display:flex; justify-content:space-between; gap:16px; align-items:end; }
      .financeiro-eyebrow { color: var(--accent-primary); letter-spacing:.12em; font-size:10px; font-weight:800; }
      .financeiro-period input { min-height:38px; border:1px solid var(--border-color); border-radius:8px; background:var(--bg-tertiary); color:var(--text-primary); padding:8px 12px; }
      .financeiro-tabs { display:flex; gap:8px; margin:18px 0; border-bottom:1px solid var(--border-color); }
      .financeiro-tabs button { border:0; background:transparent; color:var(--text-secondary); font-weight:700; padding:10px 12px; border-bottom:2px solid transparent; cursor:pointer; }
      .financeiro-tabs button.active { color:var(--accent-primary); border-color:var(--accent-primary); }
      .financeiro-kpis { display:grid; grid-template-columns:repeat(3, minmax(0,1fr)); gap:12px; margin-bottom:16px; }
      .financeiro-kpi { background:var(--bg-secondary); border:1px solid var(--border-color); border-radius:16px; padding:18px; }
      .financeiro-kpi span { display:block; color:var(--text-secondary); font-size:11px; margin-bottom:8px; }
      .financeiro-kpi strong { font-size:22px; color:var(--accent-primary); }
      .financeiro-panel { background:var(--bg-secondary); border:1px solid var(--border-color); border-radius:16px; padding:18px; margin-top:16px; }
      .financeiro-section-header { display:flex; justify-content:space-between; gap:12px; align-items:center; margin-bottom:12px; }
      .filters-grid { display:grid; grid-template-columns: repeat(4, minmax(0,1fr)); gap:12px; }
      .filters-grid label, .form-grid label { display:grid; gap:6px; font-size:12px; color:var(--text-secondary); font-weight:700; }
      .filters-grid select, .filters-grid input, .form-grid input, .form-grid select { min-height:42px; border:1px solid var(--border-color); border-radius:8px; background:var(--bg-tertiary); color:var(--text-primary); padding:9px 11px; }
      .table-wrap { overflow-x:auto; margin-top:16px; }
      table { width:100%; border-collapse:collapse; }
      th, td { padding:12px 10px; border-bottom:1px solid var(--border-light); text-align:left; }
      .status-pill { display:inline-block; padding:6px 10px; border-radius:999px; font-size:11px; font-weight:700; }
      .primary-button, .secondary-button { border:0; cursor:pointer; min-height:38px; border-radius:8px; padding:8px 12px; font-weight:700; }
      .primary-button { background:var(--accent-primary); color:#fff; }
      .secondary-button { background:var(--accent-light); color:var(--accent-primary); }
      .form-grid { display:grid; grid-template-columns:repeat(2, minmax(0,1fr)); gap:12px; }
      .checkbox-row { display:flex !important; align-items:center; gap:8px; min-height:42px; }
      .checkbox-row input { width:18px; height:18px; }
      .bar-chart { display:flex; align-items:flex-end; gap:10px; height:220px; padding-top:18px; }
      .bar-column { flex:1; display:flex; flex-direction:column; align-items:center; gap:6px; height:100%; justify-content:flex-end; }
      .bar-entrada, .bar-saida { display:block; width:18px; border-radius:8px 8px 0 0; }
      .bar-entrada { background:var(--success-bg); }
      .bar-saida { background:var(--error-bg); }
      .bar-column small, .bar-column strong { color:var(--text-secondary); font-size:10px; }
      .dre-table th { width:55%; }
      .warning-panel ul { margin:10px 0 0; padding-left:18px; }
      @media (max-width: 900px) { .filters-grid, .form-grid, .financeiro-kpis { grid-template-columns:1fr 1fr; } }
      @media (max-width: 640px) { .financeiro-header { flex-direction:column; align-items:flex-start; } .filters-grid, .form-grid, .financeiro-kpis { grid-template-columns:1fr; } .financeiro-section-header { flex-direction:column; align-items:flex-start; } }
    `}</style>
  </div>;
}

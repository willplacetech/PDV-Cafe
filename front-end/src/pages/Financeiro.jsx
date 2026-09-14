import { useContext, useEffect, useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import api from '../services/api.jsx';
import { useToast } from '../components/Toast.jsx';
import { AuthContext } from '../context/AuthContextDefinition.jsx';
import DateInput from '../components/DateInput.jsx';

const money = (value) => `R$ ${Number(value || 0).toFixed(2).replace('.', ',')}`;
const statusColors = { pago: '#16a34a', pendente: '#d97706', atrasado: '#dc2626' };
const categorias = ['Aluguel', 'Energia', 'Água', 'Internet', 'Fornecedores/Insumos', 'Salários/Pró-labore', 'Impostos', 'Marketing', 'Manutenção', 'Transporte', 'Outros'];
const percentChange = (current, previous) => previous ? ((current - previous) / Math.abs(previous)) * 100 : (current ? 100 : 0);

export default function Financeiro() {
  const { user } = useContext(AuthContext);
  const [tab, setTab] = useState('despesas');
  const [despesas, setDespesas] = useState([]);
  const [resumo, setResumo] = useState({ totalPendente: 0, totalPago: 0, totalAtrasado: 0, porCategoria: [] });
  const [fluxo, setFluxo] = useState({ dados: [], totalEntradas: 0, totalSaidas: 0, saldoDoMes: 0 });
  const [mesComparacaoA, setMesComparacaoA] = useState(new Date().toISOString().slice(0, 7));
  const [mesComparacaoB, setMesComparacaoB] = useState(() => {
    const data = new Date();
    data.setMonth(data.getMonth() - 1);
    return data.toISOString().slice(0, 7);
  });
  const [comparacao, setComparacao] = useState({ periodoA: null, periodoB: null });
  const [dre, setDre] = useState({ receitaBruta: 0, cmv: 0, lucroBruto: 0, despesasOperacionais: 0, ebit: 0, depreciacaoAmortizacao: 0, ebitda: 0, impostosEstimados: 0, lucroLiquido: 0, margemBruta: 0, margemLiquida: 0, despesasPorCategoria: {}, produtosSemCusto: [] });
  const [mesSelecionado, setMesSelecionado] = useState(new Date().toISOString().slice(0, 7));
  const [filtro, setFiltro] = useState({ status: '', categoria: '', dataInicio: '', dataFim: '' });
  const [form, setForm] = useState({ descricao: '', categoria: 'Outros', fornecedor: '', valor: '', dataVencimento: '', recorrente: false });
  const { showToast } = useToast();

  useEffect(() => {
    if (!user || user.role !== 'admin') return;

    const load = async () => {
      try {
        const [despesasRes, resumoRes, fluxoRes, dreRes, comparacaoRes] = await Promise.all([
          api.get('/despesas'),
          api.get('/despesas/resumo', { params: { mes: mesSelecionado } }),
          api.get('/contabil/fluxo-caixa', { params: { mes: mesSelecionado } }),
          api.get('/contabil/dre', { params: { mes: mesSelecionado } }),
          api.get('/contabil/comparar-meses', { params: { mesA: mesComparacaoA, mesB: mesComparacaoB } }),
        ]);

        setDespesas(despesasRes.data || []);
        setResumo(resumoRes.data || { totalPendente: 0, totalPago: 0, totalAtrasado: 0, porCategoria: [] });
        setFluxo(fluxoRes.data || { dados: [], totalEntradas: 0, totalSaidas: 0, saldoDoMes: 0 });
        setDre(dreRes.data || { receitaBruta: 0, cmv: 0, lucroBruto: 0, despesasOperacionais: 0, ebit: 0, depreciacaoAmortizacao: 0, ebitda: 0, impostosEstimados: 0, lucroLiquido: 0, margemBruta: 0, margemLiquida: 0, despesasPorCategoria: {}, produtosSemCusto: [] });
        setComparacao(comparacaoRes.data || { periodoA: null, periodoB: null });
      } catch (error) {
        showToast(error.response?.data?.msg || 'Não foi possível carregar o financeiro', 'error');
      }
    };

    load();
  }, [mesSelecionado, mesComparacaoA, mesComparacaoB, showToast, user]);

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
      await api.post('/despesas', {
        ...form,
        valor: Number(form.valor),
        dataVencimento: form.dataVencimento || new Date().toISOString(),
      });

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

  const renderStatusBadge = (status) => (
    <span
      className="financeiro-status"
      style={{
        background: `${statusColors[status] || '#64748b'}20`,
        color: statusColors[status] || '#64748b',
      }}
    >
      {status}
    </span>
  );

  return (
    <div className="financeiro-page">
      <header className="page-heading financeiro-header">
        <div>
          <span className="dashboard-eyebrow">MÓDULO FINANCEIRO</span>
          <h1>Financeiro</h1>
          <p>Contas a pagar, fluxo de caixa e DRE/EBITDA.</p>
        </div>

        <div className="financeiro-period">
          <label>
            Mês
            <input type="month" value={mesSelecionado} onChange={(event) => setMesSelecionado(event.target.value)} />
          </label>
        </div>
      </header>

      <nav className="dashboard-tabs financeiro-tabs">
        {[
          ['despesas', 'Contas a Pagar'],
          ['fluxo', 'Fluxo de Caixa'],
          ['dre', 'DRE / EBITDA'],
          ['comparar', 'Comparar Meses'],
        ].map(([key, label]) => (
          <button
            key={key}
            type="button"
            className={tab === key ? 'active' : ''}
            onClick={() => setTab(key)}
          >
            {label}
          </button>
        ))}
      </nav>

      {tab === 'despesas' && (
        <>
          <div className="financeiro-kpis">
            <div className="financeiro-kpi">
              <span>Total Pago no mês</span>
              <strong>{money(resumo.totalPago)}</strong>
            </div>
            <div className="financeiro-kpi">
              <span>Total Pendente</span>
              <strong>{money(resumo.totalPendente)}</strong>
            </div>
            <div className="financeiro-kpi">
              <span>Total Atrasado</span>
              <strong>{money(resumo.totalAtrasado)}</strong>
            </div>
          </div>

          <section className="financeiro-panel">
            <div className="dashboard-section-heading">
              <div>
                <span className="dashboard-eyebrow">CONTROLE DE DESPESAS</span>
                <h2>Despesas</h2>
              </div>
            </div>

            <div className="filters-grid">
              <label>
                Status
                <select value={filtro.status} onChange={(event) => setFiltro({ ...filtro, status: event.target.value })}>
                  <option value="">Todos</option>
                  <option value="pendente">Pendente</option>
                  <option value="pago">Pago</option>
                  <option value="atrasado">Atrasado</option>
                </select>
              </label>

              <label>
                Categoria
                <select value={filtro.categoria} onChange={(event) => setFiltro({ ...filtro, categoria: event.target.value })}>
                  <option value="">Todas</option>
                  {categorias.map((categoria) => (
                    <option key={categoria} value={categoria}>{categoria}</option>
                  ))}
                </select>
              </label>

              <label>
                De
                <DateInput value={filtro.dataInicio} onChange={(value) => setFiltro({ ...filtro, dataInicio: value })} />
              </label>

              <label>
                Até
                <DateInput value={filtro.dataFim} onChange={(value) => setFiltro({ ...filtro, dataFim: value })} />
              </label>
            </div>

            <div className="table-wrap">
              <table className="financeiro-table">
                <thead>
                  <tr>
                    <th>Descrição</th>
                    <th>Categoria</th>
                    <th>Valor</th>
                    <th>Vencimento</th>
                    <th>Status</th>
                    <th>Ação</th>
                  </tr>
                </thead>
                <tbody>
                  {despesasFiltradas.length ? (
                    despesasFiltradas.map((item) => (
                      <tr key={item._id}>
                        <td>{item.descricao}</td>
                        <td>{item.categoria}</td>
                        <td>{money(item.valor)}</td>
                        <td>{new Date(item.dataVencimento).toLocaleDateString('pt-BR')}</td>
                        <td>{renderStatusBadge(item.status)}</td>
                        <td>
                          {item.status !== 'pago' ? (
                            <button type="button" className="dashboard-print-button" onClick={() => marcarPago(item._id)}>
                              Marcar Pago
                            </button>
                          ) : (
                            '—'
                          )}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan="6" className="financeiro-empty">Nenhuma despesa encontrada.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <section className="financeiro-panel" id="nova-despesa">
            <div className="dashboard-section-heading">
              <div>
                <span className="dashboard-eyebrow">CADASTRO</span>
                <h2>Nova despesa</h2>
              </div>
            </div>

            <form className="form-grid" onSubmit={salvarDespesa}>
              <label>
                Descrição
                <input value={form.descricao} onChange={(event) => setForm({ ...form, descricao: event.target.value })} required />
              </label>

              <label>
                Categoria
                <select value={form.categoria} onChange={(event) => setForm({ ...form, categoria: event.target.value })}>
                  {categorias.map((categoria) => (
                    <option key={categoria}>{categoria}</option>
                  ))}
                </select>
              </label>

              <label>
                Fornecedor
                <input value={form.fornecedor} onChange={(event) => setForm({ ...form, fornecedor: event.target.value })} />
              </label>

              <label>
                Valor
                <input type="number" step="0.01" value={form.valor} onChange={(event) => setForm({ ...form, valor: event.target.value })} required />
              </label>

              <label>
                Vencimento
                <DateInput value={form.dataVencimento} onChange={(value) => setForm({ ...form, dataVencimento: value })} required />
              </label>

              <label className="checkbox-row">
                <input type="checkbox" checked={form.recorrente} onChange={(event) => setForm({ ...form, recorrente: event.target.checked })} />
                Despesa recorrente
              </label>

              <div className="form-submit">
                <button type="submit" className="financeiro-submit-button">Salvar</button>
              </div>
            </form>
          </section>
        </>
      )}

      {tab === 'fluxo' && (
        <>
          <div className="financeiro-kpis">
            <div className="financeiro-kpi">
              <span>Total Entradas</span>
              <strong>{money(fluxo.totalEntradas)}</strong>
            </div>
            <div className="financeiro-kpi">
              <span>Total Saídas</span>
              <strong>{money(fluxo.totalSaidas)}</strong>
            </div>
            <div className="financeiro-kpi">
              <span>Saldo do Mês</span>
              <strong>{money(fluxo.saldoDoMes)}</strong>
            </div>
          </div>

          <section className="financeiro-panel">
            <div className="dashboard-section-heading">
              <div>
                <span className="dashboard-eyebrow">MOVIMENTO DO MÊS</span>
                <h2>Fluxo de caixa</h2>
              </div>
            </div>

            <div className="chart-box">
              {fluxo.dados.length ? (
                <div className="bar-chart">
                  {fluxo.dados.map((dia) => (
                    <div key={dia.data} className="bar-column">
                      <span className="bar-entrada" style={{ height: `${Math.max(10, (dia.entradas / Math.max(fluxo.totalEntradas, 1)) * 100)}%` }} />
                      <span className="bar-saida" style={{ height: `${Math.max(10, (dia.saidas / Math.max(fluxo.totalSaidas, 1)) * 100)}%` }} />
                      <small>{new Date(`${dia.data}T12:00:00`).getDate()}</small>
                      <strong>{money(dia.saldoAcumulado)}</strong>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="financeiro-empty">Nenhum dado para este mês.</p>
              )}
            </div>
          </section>
        </>
      )}

      {tab === 'dre' && (
        <>
          <section className="financeiro-panel">
            <div className="dashboard-section-heading">
              <div>
                <span className="dashboard-eyebrow">DEMONSTRATIVO</span>
                <h2>DRE / EBITDA</h2>
              </div>
              <button type="button" className="financeiro-secondary-button" onClick={exportarCsv}>
                Exportar CSV
              </button>
            </div>

            <div className="table-wrap">
              <table className="financeiro-table dre-table">
                <tbody>
                  <tr><th>Receita Bruta</th><td>{money(dre.receitaBruta)}</td><td>100%</td></tr>
                  <tr><th>− CMV</th><td>{money(dre.cmv)}</td><td>{dre.receitaBruta ? `${((dre.cmv / dre.receitaBruta) * 100).toFixed(1)}%` : '0%'}</td></tr>
                  <tr><th>= Lucro Bruto</th><td>{money(dre.lucroBruto)}</td><td>{dre.receitaBruta ? `${((dre.lucroBruto / dre.receitaBruta) * 100).toFixed(1)}%` : '0%'}</td></tr>
                  {Object.entries(dre.despesasPorCategoria || {}).map(([categoria, valor]) => (
                    <tr key={categoria}><th>− {categoria}</th><td>{money(valor)}</td><td>{dre.receitaBruta ? `${((valor / dre.receitaBruta) * 100).toFixed(1)}%` : '0%'}</td></tr>
                  ))}
                  <tr><th>= EBIT</th><td>{money(dre.ebit)}</td><td>{dre.receitaBruta ? `${((dre.ebit / dre.receitaBruta) * 100).toFixed(1)}%` : '0%'}</td></tr>
                  <tr><th>+ Depreciação/Amortização</th><td>{money(dre.depreciacaoAmortizacao)}</td><td>—</td></tr>
                  <tr><th>= EBITDA</th><td>{money(dre.ebitda)}</td><td>{dre.receitaBruta ? `${((dre.ebitda / dre.receitaBruta) * 100).toFixed(1)}%` : '0%'}</td></tr>
                  <tr><th>− Impostos</th><td>{money(dre.impostosEstimados)}</td><td>—</td></tr>
                  <tr><th>= Lucro Líquido</th><td>{money(dre.lucroLiquido)}</td><td>{dre.receitaBruta ? `${((dre.lucroLiquido / dre.receitaBruta) * 100).toFixed(1)}%` : '0%'}</td></tr>
                </tbody>
              </table>
            </div>
          </section>

          {dre.produtosSemCusto?.length > 0 && (
            <section className="financeiro-panel warning-panel">
              <div className="dashboard-section-heading">
                <div>
                  <span className="dashboard-eyebrow">ALERTA</span>
                  <h2>Produtos sem custo cadastrado</h2>
                </div>
              </div>
              <ul>
                {dre.produtosSemCusto.map((nome) => <li key={nome}>{nome}</li>)}
              </ul>
            </section>
          )}
        </>
      )}

      {tab === 'comparar' && (
        <section className="financeiro-panel">
          <div className="dashboard-section-heading">
            <div>
              <span className="dashboard-eyebrow">ANÁLISE COMPARATIVA</span>
              <h2>Comparar mês a mês</h2>
              <p>Escolha os períodos para comparar vendas, recebimentos e despesas.</p>
            </div>
          </div>

          <div className="compare-periods">
            <label>
              Mês principal
              <input type="month" value={mesComparacaoA} onChange={(event) => setMesComparacaoA(event.target.value)} />
            </label>
            <span className="compare-versus">versus</span>
            <label>
              Mês de comparação
              <input type="month" value={mesComparacaoB} onChange={(event) => setMesComparacaoB(event.target.value)} />
            </label>
          </div>

          {comparacao.periodoA && comparacao.periodoB && (
            <div className="compare-table-wrap">
              <table className="financeiro-table compare-table">
                <thead>
                  <tr><th>Indicador</th><th>{comparacao.periodoA.mes}</th><th>{comparacao.periodoB.mes}</th><th>Variação</th></tr>
                </thead>
                <tbody>
                  {[
                    ['Receita de vendas', comparacao.periodoA.receita, comparacao.periodoB.receita, true],
                    ['Entradas recebidas', comparacao.periodoA.entradas, comparacao.periodoB.entradas, true],
                    ['Despesas pagas', comparacao.periodoA.despesasPagas, comparacao.periodoB.despesasPagas, true],
                    ['Saldo de caixa', comparacao.periodoA.saldo, comparacao.periodoB.saldo, true],
                    ['Resultado operacional', comparacao.periodoA.resultadoOperacional, comparacao.periodoB.resultadoOperacional, true],
                    ['Pedidos', comparacao.periodoA.pedidos, comparacao.periodoB.pedidos, false],
                  ].map(([label, valorA, valorB, isMoney]) => (
                    <tr key={label}>
                      <th>{label}</th>
                      <td>{isMoney ? money(valorA) : valorA}</td>
                      <td>{isMoney ? money(valorB) : valorB}</td>
                      <td className={percentChange(valorA, valorB) >= 0 ? 'compare-positive' : 'compare-negative'}>
                        {percentChange(valorA, valorB) >= 0 ? '+' : ''}{percentChange(valorA, valorB).toFixed(1)}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      <style>{`
        .financeiro-page {
          color: var(--text-primary);
        }

        .financeiro-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-end;
          gap: 16px;
        }

        .financeiro-period {
          display: flex;
          align-items: center;
        }

        .financeiro-period label {
          display: grid;
          gap: 6px;
          color: var(--text-secondary);
          font-size: 11px;
          font-weight: 700;
        }

        .financeiro-period input {
          min-height: 42px;
          padding: 9px 12px;
          border: 1px solid var(--border-color);
          border-radius: 8px;
          background: var(--bg-tertiary);
          color: var(--text-primary);
        }

        .financeiro-tabs {
          margin: 16px 0 18px;
        }

        .financeiro-kpis {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 12px;
          margin-bottom: 16px;
        }

        .financeiro-kpi {
          background: var(--bg-secondary);
          border: 1px solid var(--border-color);
          border-radius: 16px;
          padding: 18px;
          box-shadow: var(--shadow-sm);
        }

        .financeiro-kpi span {
          display: block;
          color: var(--text-secondary);
          font-size: 11px;
          margin-bottom: 8px;
        }

        .financeiro-kpi strong {
          display: block;
          color: var(--accent-primary);
          font-size: 22px;
          line-height: 1.2;
        }

        .financeiro-panel {
          background: var(--bg-secondary);
          border: 1px solid var(--border-color);
          border-radius: 16px;
          padding: 18px;
          box-shadow: var(--shadow-sm);
          margin-top: 16px;
        }

        .filters-grid {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 12px;
          margin-top: 10px;
        }

        .filters-grid label,
        .form-grid label {
          display: grid;
          gap: 6px;
          color: var(--text-secondary);
          font-size: 11px;
          font-weight: 700;
        }

        .filters-grid select,
        .filters-grid input,
        .form-grid input,
        .form-grid select {
          min-height: 42px;
          border: 1px solid var(--border-color);
          border-radius: 8px;
          background: var(--bg-tertiary);
          color: var(--text-primary);
          padding: 9px 11px;
          width: 100%;
          box-sizing: border-box;
        }

        .table-wrap {
          overflow-x: auto;
          margin-top: 16px;
        }

        .financeiro-table {
          width: 100%;
          border-collapse: collapse;
        }

        .financeiro-table th,
        .financeiro-table td {
          padding: 12px 10px;
          border-bottom: 1px solid var(--border-light);
          text-align: left;
          vertical-align: middle;
        }

        .financeiro-table th {
          color: var(--text-secondary);
          font-size: 11px;
          text-transform: uppercase;
          letter-spacing: 0.06em;
        }

        .financeiro-table td {
          color: var(--text-primary);
          font-size: 13px;
        }

        .financeiro-status {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-height: 30px;
          padding: 5px 10px;
          border-radius: 999px;
          font-size: 11px;
          font-weight: 800;
          text-transform: lowercase;
        }

        .form-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 12px;
          margin-top: 10px;
        }

        .checkbox-row {
          display: flex !important;
          align-items: center;
          gap: 8px;
          min-height: 42px;
          padding-top: 22px;
        }

        .checkbox-row input {
          width: 18px;
          height: 18px;
          min-height: auto;
        }

        .form-submit {
          display: flex;
          align-items: end;
          justify-content: flex-end;
          grid-column: 1 / -1;
        }

        .financeiro-submit-button {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-height: 42px;
          padding: 10px 18px;
          border: 1px solid var(--accent-primary);
          border-radius: 10px;
          background: var(--accent-primary);
          color: #fff;
          font-size: 13px;
          font-weight: 700;
          cursor: pointer;
          transition: filter 0.2s ease;
          min-width: 180px;
        }

        .financeiro-submit-button:hover {
          filter: brightness(0.98);
        }

        .financeiro-secondary-button {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-height: 42px;
          padding: 10px 16px;
          border: 1px solid var(--accent-border);
          border-radius: 10px;
          background: var(--accent-light);
          color: var(--accent-primary);
          font-size: 13px;
          font-weight: 700;
          cursor: pointer;
          white-space: nowrap;
          transition: background 0.2s ease, border-color 0.2s ease;
        }

        .financeiro-secondary-button:hover {
          background: var(--bg-tertiary);
          border-color: var(--accent-primary);
        }

        .compare-periods {
          display: grid;
          grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
          align-items: end;
          gap: 12px;
          margin: 16px 0;
        }

        .compare-periods label {
          display: grid;
          gap: 6px;
          color: var(--text-secondary);
          font-size: 11px;
          font-weight: 700;
        }

        .compare-periods input {
          min-height: 42px;
          padding: 9px 12px;
          border: 1px solid var(--border-color);
          border-radius: 8px;
          background: var(--bg-tertiary);
          color: var(--text-primary);
        }

        .compare-versus {
          padding-bottom: 12px;
          color: var(--text-secondary);
          font-size: 12px;
          font-weight: 800;
        }

        .compare-table-wrap { overflow-x: auto; }
        .compare-table { min-width: 620px; }
        .compare-table th:not(:first-child),
        .compare-table td:not(:first-child) { text-align: right; }
        .compare-positive { color: var(--success-bg) !important; font-weight: 800; }
        .compare-negative { color: var(--error-bg) !important; font-weight: 800; }

        .bar-chart {
          display: flex;
          align-items: flex-end;
          gap: 10px;
          height: 220px;
          padding-top: 18px;
          overflow-x: auto;
        }

        .bar-column {
          min-width: 52px;
          flex: 1;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: flex-end;
          gap: 6px;
          height: 100%;
        }

        .bar-entrada,
        .bar-saida {
          display: block;
          width: 18px;
          border-radius: 8px 8px 0 0;
        }

        .bar-entrada {
          background: var(--success-bg);
        }

        .bar-saida {
          background: var(--error-bg);
        }

        .bar-column small { color: var(--text-secondary); font-size: 10px; }
        .bar-column strong { color: var(--text-primary); font-size: 10px; }

        .dre-table th {
          width: 52%;
        }

        .warning-panel ul {
          margin: 0;
          padding-left: 18px;
          color: var(--text-primary);
        }

        .warning-panel li + li {
          margin-top: 8px;
        }

        .financeiro-empty {
          padding: 18px 12px;
          color: var(--text-secondary);
          text-align: center;
        }

        @media (max-width: 900px) {
          .financeiro-kpis,
          .filters-grid,
          .form-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }

          .compare-periods { grid-template-columns: 1fr 1fr; }
          .compare-versus { display: none; }
        }

        @media (max-width: 640px) {
          .financeiro-header {
            flex-direction: column;
            align-items: flex-start;
          }

          .financeiro-kpis,
          .filters-grid,
          .form-grid {
            grid-template-columns: 1fr;
          }

          .compare-periods { grid-template-columns: 1fr; }

          .dashboard-section-heading {
            flex-direction: column;
            align-items: flex-start;
          }

          .form-submit {
            justify-content: stretch;
          }

          .form-submit button {
            width: 100%;
          }

          .financeiro-table {
            min-width: 640px;
          }
        }
      `}</style>
    </div>
  );
}

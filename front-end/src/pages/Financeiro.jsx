import { useContext, useEffect, useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import api from '../services/api.jsx';
import { useToast } from '../components/useToast.js';
import AreaTabs from '../components/AreaTabs.jsx';
import { AuthContext } from '../context/AuthContextDefinition.jsx';
import DateInput from '../components/DateInput.jsx';

const money = (value) => `R$ ${Number(value || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const statusColors = { pago: '#16a34a', pendente: '#d97706', atrasado: '#dc2626' };
const categorias = ['Aluguel', 'Energia', 'Água', 'Internet', 'Fornecedores/Insumos', 'Salários/Pró-labore', 'Impostos', 'Marketing', 'Manutenção', 'Transporte', 'Outros'];
const percentChange = (current, previous) => previous ? ((current - previous) / Math.abs(previous)) * 100 : (current ? 100 : 0);
const dateKey = (value) => {
  const isoDate = typeof value === 'string' ? value.slice(0, 10) : new Date(value).toISOString().slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(isoDate) ? isoDate : '';
};
const formatDate = (value) => dateKey(value).split('-').reverse().join('/');

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
  const [dre, setDre] = useState({ receitaBruta: 0, deducoes: 0, receitaLiquida: 0, taxasCartao: 0, cmv: 0, cmvFormula: '', cmvComponentes: {}, lucroBruto: 0, despesasOperacionais: 0, ebit: 0, depreciacaoAmortizacao: 0, ebitda: 0, despesasFinanceiras: 0, impostosEstimados: 0, lucroLiquido: 0, margemBruta: 0, margemLiquida: 0, despesasPorCategoria: {}, produtosSemCusto: [] });
  const [mesSelecionado, setMesSelecionado] = useState(new Date().toISOString().slice(0, 7));
  const [filtro, setFiltro] = useState({ status: '', categoria: '', dataInicio: '', dataFim: '' });
  const [form, setForm] = useState({ descricao: '', categoria: 'Outros', fornecedor: '', valor: '', dataVencimento: '', recorrente: false });
  const [despesaEmEdicao, setDespesaEmEdicao] = useState(null);
  const [alterarTodasRecorrentes, setAlterarTodasRecorrentes] = useState(false);
  const [formatoVencimentoRecorrente, setFormatoVencimentoRecorrente] = useState('dia');
  const [diaVencimentoRecorrente, setDiaVencimentoRecorrente] = useState('');
  const [salvandoDespesa, setSalvandoDespesa] = useState(false);
  const [carregando, setCarregando] = useState(true);
  const [erroCarregamento, setErroCarregamento] = useState('');
  const { showToast } = useToast();

  useEffect(() => {
    if (!user || user.role !== 'admin') return;

    let active = true;
    const load = async () => {
      setCarregando(true);
      setErroCarregamento('');
      try {
        if (tab === 'despesas') {
          const [despesasResponse, resumoResponse] = await Promise.all([
            api.get('/despesas'),
            api.get('/despesas/resumo', { params: { mes: mesSelecionado } }),
          ]);
          if (active) {
            setDespesas(despesasResponse.data || []);
            setResumo(resumoResponse.data || { totalPendente: 0, totalPago: 0, totalAtrasado: 0, porCategoria: [] });
          }
        } else if (tab === 'fluxo') {
          const response = await api.get('/contabil/fluxo-caixa', { params: { mes: mesSelecionado } });
          if (active) setFluxo(response.data || { dados: [], totalEntradas: 0, totalSaidas: 0, saldoDoMes: 0 });
        } else if (tab === 'dre') {
          const response = await api.get('/contabil/dre', { params: { mes: mesSelecionado } });
          if (active) setDre(response.data || { receitaBruta: 0, deducoes: 0, receitaLiquida: 0, taxasCartao: 0, cmv: 0, cmvFormula: '', cmvComponentes: {}, lucroBruto: 0, despesasOperacionais: 0, ebit: 0, depreciacaoAmortizacao: 0, ebitda: 0, despesasFinanceiras: 0, impostosEstimados: 0, lucroLiquido: 0, margemBruta: 0, margemLiquida: 0, despesasPorCategoria: {}, produtosSemCusto: [] });
        } else {
          const response = await api.get('/contabil/comparar-meses', { params: { mesA: mesComparacaoA, mesB: mesComparacaoB } });
          if (active) setComparacao(response.data || { periodoA: null, periodoB: null });
        }
      } catch (error) {
        const mensagem = error.response?.data?.msg || 'Não foi possível carregar o financeiro';
        if (active) {
          setErroCarregamento(mensagem);
          showToast(mensagem, 'error');
        }
      } finally {
        if (active) setCarregando(false);
      }
    };

    load();
    return () => { active = false; };
  }, [mesSelecionado, mesComparacaoA, mesComparacaoB, showToast, tab, user]);

  const despesasFiltradas = useMemo(() => despesas.filter((despesa) => {
    const matchesStatus = !filtro.status || despesa.status === filtro.status;
    const matchesCategoria = !filtro.categoria || despesa.categoria === filtro.categoria;
    const vencimento = dateKey(despesa.dataVencimento);
    const matchesInicio = !filtro.dataInicio || vencimento >= filtro.dataInicio;
    const matchesFim = !filtro.dataFim || vencimento <= filtro.dataFim;
    return matchesStatus && matchesCategoria && matchesInicio && matchesFim;
  }), [despesas, filtro]);

  const recarregarDespesas = async () => {
    const [despesasResponse, resumoResponse] = await Promise.all([
      api.get('/despesas'),
      api.get('/despesas/resumo', { params: { mes: mesSelecionado } }),
    ]);
    setDespesas(despesasResponse.data || []);
    setResumo(resumoResponse.data || { totalPendente: 0, totalPago: 0, totalAtrasado: 0, porCategoria: [] });
  };

  const aplicarDiaNasParcelasRecorrentes = async (despesa, dia, camposAtualizacao) => {
    const origemId = despesa.origemRecorrencia || despesa._id;
    const parcelasAbertas = despesas.filter((parcela) => (
      parcela.recorrente
      && parcela.status !== 'pago'
      && (String(parcela._id) === String(origemId) || String(parcela.origemRecorrencia) === String(origemId))
    ));
    const parcelas = parcelasAbertas.some((parcela) => String(parcela._id) === String(despesa._id))
      ? parcelasAbertas
      : [...parcelasAbertas, despesa].filter((parcela) => parcela.status !== 'pago');

    if (!parcelas.length) {
      throw new Error('Não há parcelas abertas da recorrência para atualizar');
    }

    const datasEsperadas = new Map();
    for (const parcela of parcelas) {
      const vencimentoAtual = new Date(parcela.dataVencimento);
      const ano = vencimentoAtual.getUTCFullYear();
      const mes = vencimentoAtual.getUTCMonth();
      const ultimoDiaDoMes = new Date(Date.UTC(ano, mes + 1, 0)).getUTCDate();
      const vencimento = new Date(Date.UTC(ano, mes, Math.min(dia, ultimoDiaDoMes)));
      const dataIso = vencimento.toISOString();
      datasEsperadas.set(String(parcela._id), dataIso);
      await api.put(`/despesas/${parcela._id}`, {
        ...camposAtualizacao,
        dataVencimento: dataIso,
      });
    }

    const { data: despesasAtuais } = await api.get('/despesas');
    const despesasPorId = new Map(despesasAtuais.map((item) => [String(item._id), item]));
    const naoAtualizadas = [...datasEsperadas].filter(([id, dataIso]) => (
      !despesasPorId.has(id) || dateKey(despesasPorId.get(id).dataVencimento) !== dataIso.slice(0, 10)
    ));

    if (naoAtualizadas.length) {
      throw new Error(`O servidor não confirmou a atualização de ${naoAtualizadas.length} parcela(s)`);
    }

    setDespesas(despesasAtuais);
    return parcelas.length;
  };

  if (!user || user.role !== 'admin') return <Navigate to="/pdv" replace />;

  if (carregando) return <><AreaTabs area="dashboard" /><div className="financeiro-page"><section className="financeiro-panel financeiro-state"><h2>Carregando financeiro...</h2><p>Consultando despesas, caixa e DRE.</p></section></div></>;

  const salvarDespesa = async (event) => {
    event.preventDefault();
    setSalvandoDespesa(true);
    try {
      const payload = {
        descricao: form.descricao,
        categoria: form.categoria,
        fornecedor: form.fornecedor,
        valor: Number(form.valor),
      };

      if (despesaEmEdicao) {
        const usaDiaVencimento = despesaEmEdicao.recorrente
          && alterarTodasRecorrentes
          && formatoVencimentoRecorrente === 'dia';
        if (usaDiaVencimento) {
          const quantidade = await aplicarDiaNasParcelasRecorrentes(
            despesaEmEdicao,
            Number(diaVencimentoRecorrente),
            payload,
          );
          showToast(`${quantidade} parcela(s) pendente(s) ou atrasada(s) atualizada(s)`, 'success');
        } else {
          payload.dataVencimento = form.dataVencimento;
          const { data: despesaAtualizada } = await api.put(`/despesas/${despesaEmEdicao._id}`, {
            ...payload,
            alterarTodas: despesaEmEdicao.recorrente && alterarTodasRecorrentes,
          });
          if (alterarTodasRecorrentes) {
            const quantidade = Number(despesaAtualizada.parcelasAtualizadas || 0);
            if (!quantidade) {
              throw new Error('O servidor não confirmou a atualização de nenhuma parcela recorrente');
            }
            showToast(`${quantidade} parcela(s) pendente(s) ou atrasada(s) atualizada(s)`, 'success');
          } else {
            showToast('Despesa atualizada com sucesso', 'success');
          }
        }
      } else {
        await api.post('/despesas', {
          ...payload,
          dataVencimento: form.dataVencimento || new Date().toISOString(),
          recorrente: form.recorrente,
        });
        showToast('Despesa cadastrada com sucesso', 'success');
      }

      setForm({ descricao: '', categoria: 'Outros', fornecedor: '', valor: '', dataVencimento: '', recorrente: false });
      setDespesaEmEdicao(null);
      setAlterarTodasRecorrentes(false);
      setFormatoVencimentoRecorrente('dia');
      setDiaVencimentoRecorrente('');
      await recarregarDespesas();
    } catch (error) {
      showToast(error.response?.data?.msg || error.message || 'Não foi possível salvar a despesa', 'error');
    } finally {
      setSalvandoDespesa(false);
    }
  };

  const marcarPago = async (id) => {
    try {
      await api.put(`/despesas/${id}/pagar`);
      await recarregarDespesas();
      showToast('Despesa marcada como paga', 'success');
    } catch (error) {
      showToast(error.response?.data?.msg || 'Não foi possível marcar como pago', 'error');
    }
  };

  const editarDespesa = (despesa) => {
    const dataVencimento = new Date(despesa.dataVencimento);
    setDespesaEmEdicao(despesa);
    setAlterarTodasRecorrentes(Boolean(despesa.recorrente));
    setFormatoVencimentoRecorrente(despesa.recorrente ? 'dia' : 'data');
    setDiaVencimentoRecorrente(String(dataVencimento.getUTCDate()));
    setForm({
      descricao: despesa.descricao || '',
      categoria: despesa.categoria || 'Outros',
      fornecedor: despesa.fornecedor || '',
      valor: String(despesa.valor ?? ''),
      dataVencimento: dataVencimento.toISOString().slice(0, 10),
      recorrente: Boolean(despesa.recorrente),
    });
    document.getElementById('nova-despesa')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const cancelarEdicaoDespesa = () => {
    setDespesaEmEdicao(null);
    setAlterarTodasRecorrentes(false);
    setFormatoVencimentoRecorrente('dia');
    setDiaVencimentoRecorrente('');
    setForm({ descricao: '', categoria: 'Outros', fornecedor: '', valor: '', dataVencimento: '', recorrente: false });
  };

  const excluirDespesa = async (despesa) => {
    if (!window.confirm(`Deseja excluir a despesa "${despesa.descricao}"?`)) return;
    try {
      await api.delete(`/despesas/${despesa._id}`);
      if (despesaEmEdicao?._id === despesa._id) cancelarEdicaoDespesa();
      await recarregarDespesas();
      showToast('Despesa excluída com sucesso', 'success');
    } catch (error) {
      showToast(error.response?.data?.msg || 'Não foi possível excluir a despesa', 'error');
    }
  };

  const exportarCsv = () => {
    const linhas = [
      ['Receita Bruta', dre.receitaBruta],
      ['Deduções', dre.deducoes],
      ['Receita Líquida', dre.receitaLiquida],
      ['CMV', dre.cmv],
      ['Fórmula do CMV', dre.cmvFormula],
      ['Lucro Bruto', dre.lucroBruto],
      ['Despesas Operacionais', dre.despesasOperacionais],
      ['EBIT', dre.ebit],
      ['Depreciação/Amortização', dre.depreciacaoAmortizacao],
      ['EBITDA', dre.ebitda],
      ['Financeiro', dre.despesasFinanceiras],
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
    <>
      <AreaTabs area="dashboard" />
      <div className="financeiro-page">
      {erroCarregamento && <section className="financeiro-panel financeiro-error"><strong>Não foi possível carregar todos os dados.</strong><span>{erroCarregamento}</span><button type="button" onClick={() => window.location.reload()}>Tentar novamente</button></section>}
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

      {carregando && (
        <section className="financeiro-panel financeiro-loading" style={{ textAlign: 'center', padding: 40 }}>
          <div style={{ display: 'inline-block', width: 32, height: 32, border: '3px solid var(--border-color)', borderTopColor: 'var(--accent-primary)', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          <p style={{ marginTop: 12, color: 'var(--text-secondary)' }}>Carregando dados financeiros...</p>
        </section>
      )}

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
                    <th>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {despesasFiltradas.length ? (
                    despesasFiltradas.map((item) => (
                      <tr key={item._id}>
                        <td>{item.descricao}</td>
                        <td>{item.categoria}</td>
                        <td>{money(item.valor)}</td>
                        <td>{formatDate(item.dataVencimento)}</td>
                        <td>{renderStatusBadge(item.status)}</td>
                        <td>
                          <div className="financeiro-row-actions">
                            {item.status !== 'pago' && (
                              <button type="button" className="financeiro-submit-button financeiro-action-button" onClick={() => marcarPago(item._id)}>
                                Marcar Pago
                              </button>
                            )}
                            <button type="button" className="financeiro-secondary-button financeiro-action-button" onClick={() => editarDespesa(item)}>
                              Editar
                            </button>
                            <button type="button" className="financeiro-delete-button financeiro-action-button" onClick={() => excluirDespesa(item)}>
                              Excluir
                            </button>
                          </div>
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
                <span className="dashboard-eyebrow">{despesaEmEdicao ? 'EDIÇÃO' : 'CADASTRO'}</span>
                <h2>{despesaEmEdicao ? 'Editar despesa' : 'Nova despesa'}</h2>
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

              {!(despesaEmEdicao?.recorrente
                && alterarTodasRecorrentes
                && formatoVencimentoRecorrente === 'dia') && (
                <label>
                  Vencimento
                  <DateInput value={form.dataVencimento} onChange={(value) => setForm({ ...form, dataVencimento: value })} required />
                </label>
              )}

              {despesaEmEdicao?.recorrente ? (
                <>
                  <label className="checkbox-row financeiro-recurring-option">
                    <input
                      type="checkbox"
                      checked={alterarTodasRecorrentes}
                      onChange={(event) => {
                        setAlterarTodasRecorrentes(event.target.checked);
                        if (event.target.checked) setFormatoVencimentoRecorrente('dia');
                      }}
                    />
                    Aplicar alterações a todas as parcelas pendentes e atrasadas desta recorrência
                  </label>
                  <p className="financeiro-recurring-help">
                    {alterarTodasRecorrentes
                      ? 'O vencimento escolhido será aplicado a cada parcela aberta. Parcelas pagas não serão alteradas.'
                      : 'A série não será alterada. Marque esta opção para aplicar a mudança a todas as parcelas abertas.'}
                  </p>
                  {alterarTodasRecorrentes && (
                    <>
                      <label>
                        Formato do vencimento
                        <select value={formatoVencimentoRecorrente} onChange={(event) => setFormatoVencimentoRecorrente(event.target.value)}>
                          <option value="data">Data completa</option>
                          <option value="dia">Dia do mês</option>
                        </select>
                      </label>
                      {formatoVencimentoRecorrente === 'dia' ? (
                        <label>
                          Dia do vencimento (1 a 31)
                          <input
                            type="number"
                            min="1"
                            max="31"
                            step="1"
                            value={diaVencimentoRecorrente}
                            onChange={(event) => setDiaVencimentoRecorrente(event.target.value)}
                            required
                          />
                        </label>
                      ) : null}
                    </>
                  )}
                </>
              ) : !despesaEmEdicao && (
                <label className="checkbox-row">
                  <input type="checkbox" checked={form.recorrente} onChange={(event) => setForm({ ...form, recorrente: event.target.checked })} />
                  Despesa recorrente
                </label>
              )}

              <div className="form-submit">
                {despesaEmEdicao && <button type="button" className="financeiro-secondary-button" onClick={cancelarEdicaoDespesa}>Cancelar</button>}
                <button type="submit" className="financeiro-submit-button" disabled={salvandoDespesa}>
                  {salvandoDespesa ? 'Salvando...' : despesaEmEdicao ? 'Salvar alterações' : 'Salvar'}
                </button>
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
                  <tr><th>− Deduções</th><td>{money(dre.deducoes)}</td><td>{dre.receitaBruta ? `${((dre.deducoes / dre.receitaBruta) * 100).toFixed(1)}%` : '0%'}</td></tr>
                  <tr><th>= Receita Líquida</th><td>{money(dre.receitaLiquida)}</td><td>{dre.receitaBruta ? `${((dre.receitaLiquida / dre.receitaBruta) * 100).toFixed(1)}%` : '0%'}</td></tr>
                  <tr><th>− CMV</th><td>{money(dre.cmv)}</td><td>{dre.receitaBruta ? `${((dre.cmv / dre.receitaBruta) * 100).toFixed(1)}%` : '0%'}</td></tr>
                  <tr><th colSpan="3">CMV = {dre.cmvFormula || 'Estoque inicial + Compras - Estoque final'}</th></tr>
                  <tr><th>= Lucro Bruto</th><td>{money(dre.lucroBruto)}</td><td>{dre.receitaBruta ? `${((dre.lucroBruto / dre.receitaBruta) * 100).toFixed(1)}%` : '0%'}</td></tr>
                  <tr><th>− Despesas Operacionais</th><td>{money(dre.despesasOperacionais)}</td><td>{dre.receitaLiquida ? `${((dre.despesasOperacionais / dre.receitaLiquida) * 100).toFixed(1)}%` : '0%'}</td></tr>
                  {Object.entries(dre.despesasPorCategoria || {}).map(([categoria, valor]) => (
                    <tr key={categoria}><th>↳ {categoria}</th><td>{money(valor)}</td><td>{dre.receitaLiquida ? `${((valor / dre.receitaLiquida) * 100).toFixed(1)}%` : '0%'}</td></tr>
                  ))}
                  <tr><th>= EBIT</th><td>{money(dre.ebit)}</td><td>{dre.receitaBruta ? `${((dre.ebit / dre.receitaBruta) * 100).toFixed(1)}%` : '0%'}</td></tr>
                  <tr><th>+ Depreciação/Amortização</th><td>{money(dre.depreciacaoAmortizacao)}</td><td>—</td></tr>
                  <tr><th>= EBITDA</th><td>{money(dre.ebitda)}</td><td>{dre.receitaBruta ? `${((dre.ebitda / dre.receitaBruta) * 100).toFixed(1)}%` : '0%'}</td></tr>
                  <tr><th>− Financeiro</th><td>{money(dre.despesasFinanceiras)}</td><td>—</td></tr>
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
          min-width: 0;
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

        .financeiro-state,
        .financeiro-error {
          display: grid;
          gap: 8px;
        }

        .financeiro-state p,
        .financeiro-error span {
          color: var(--text-secondary);
          font-size: 13px;
        }

        .financeiro-error {
          border-color: rgba(220, 38, 38, .35);
        }

        .financeiro-error button {
          width: fit-content;
          min-height: 38px;
          padding: 8px 12px;
          border: 0;
          border-radius: 8px;
          background: var(--accent-primary);
          color: #fff;
          font-weight: 700;
          cursor: pointer;
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
          gap: 8px;
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

        .financeiro-submit-button:disabled {
          cursor: wait;
          opacity: 0.7;
        }

        .financeiro-action-button {
          min-width: 0;
          min-height: 36px;
          padding: 8px 10px;
          border-radius: 8px;
          font-size: 12px;
        }

        .financeiro-row-actions {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 6px;
          min-width: 225px;
        }

        .financeiro-delete-button {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-height: 36px;
          padding: 8px 10px;
          border: 1px solid rgba(220, 38, 38, .3);
          border-radius: 8px;
          background: rgba(220, 38, 38, .08);
          color: #dc2626;
          font-size: 12px;
          font-weight: 700;
          cursor: pointer;
        }

        .financeiro-delete-button:hover {
          background: rgba(220, 38, 38, .14);
        }

        .financeiro-recurring-option {
          grid-column: 1 / -1;
        }

        .financeiro-recurring-help {
          grid-column: 1 / -1;
          margin: -8px 0 0;
          color: var(--text-secondary);
          font-size: 12px;
          line-height: 1.45;
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

        .financeiro-page .dashboard-section-heading > div { min-width: 0; }
        .financeiro-page .dashboard-section-heading h2,
        .financeiro-page .dashboard-section-heading p { overflow-wrap: anywhere; }

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
          .financeiro-page { overflow-x: hidden; }
          .financeiro-header {
            flex-direction: column;
            align-items: flex-start;
          }

          .financeiro-header > div,
          .financeiro-period,
          .financeiro-period label,
          .financeiro-period input { width: 100%; }

          .financeiro-tabs { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 6px; }
          .financeiro-tabs button { min-height: 44px; padding: 8px 6px; white-space: normal; }

          .financeiro-kpis,
          .filters-grid,
          .form-grid {
            grid-template-columns: 1fr;
          }

          .compare-periods { grid-template-columns: 1fr; }

          .financeiro-panel { padding: 14px; border-radius: 12px; }
          .financeiro-kpi { padding: 14px; border-radius: 12px; }
          .financeiro-kpi strong { font-size: 20px; overflow-wrap: anywhere; }

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

          .dre-table { min-width: 0 !important; width: 100%; }
          .dre-table th { width: auto; }
          .dre-table th, .dre-table td { padding: 10px 6px; font-size: 12px; }
          .dre-table th { overflow-wrap: anywhere; }
          .compare-table-wrap { margin-right: -14px; padding-right: 14px; }
        }

        @media (max-width: 380px) {
          .financeiro-tabs { grid-template-columns: 1fr; }
          .financeiro-kpi strong { font-size: 18px; }
          .financeiro-table { min-width: 600px; }
          .dre-table { min-width: 0 !important; }
        }
      `}</style>
      </div>
    </>
  );
}

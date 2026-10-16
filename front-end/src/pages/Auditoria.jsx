import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import api from '../services/api.jsx';
import DateInput from '../components/DateInput.jsx';
import EstadoLista from '../components/EstadoLista.jsx';
import Paginacao from '../components/Paginacao.jsx';
import useUrlPagination from '../hooks/useUrlPagination.js';
import { updatePaginationParams } from '../utils/paginationUrl.js';

const inputStyle = {
  width: '100%',
  minHeight: 40,
  padding: '8px 10px',
  border: '1px solid var(--border-color)',
  borderRadius: 8,
  background: 'var(--bg-secondary)',
  color: 'var(--text-primary)',
  boxSizing: 'border-box',
};

const cellStyle = {
  padding: '10px 12px',
  borderBottom: '1px solid var(--border-color)',
  textAlign: 'left',
  verticalAlign: 'top',
  fontSize: 13,
};

export default function Auditoria() {
  const [searchParams, setSearchParams] = useSearchParams();
  const paginacao = useUrlPagination();
  const { paginaAtual, limiteAtual, alterarPagina } = paginacao;
  const [registros, setRegistros] = useState([]);
  const [total, setTotal] = useState(0);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');
  const requestIdRef = useRef(0);
  const usuario = searchParams.get('usuario') || '';
  const acao = searchParams.get('acao') || '';
  const sucesso = searchParams.get('sucesso') || '';
  const dataInicio = searchParams.get('dataInicio') || '';
  const dataFim = searchParams.get('dataFim') || '';

  const atualizarFiltro = (nome, valor) => {
    setSearchParams((current) => {
      const next = updatePaginationParams(current, { pagina: 1 });
      if (!valor) next.delete(nome);
      else next.set(nome, valor);
      return next;
    }, { replace: true });
  };

  const limparFiltros = () => {
    setSearchParams((current) => {
      const next = updatePaginationParams(current, { pagina: 1 });
      ['usuario', 'acao', 'sucesso', 'dataInicio', 'dataFim'].forEach((nome) => next.delete(nome));
      return next;
    }, { replace: true });
  };

  const carregar = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    setCarregando(true);
    setErro('');
    try {
      const { data } = await api.get('/auditoria', {
        params: {
          pagina: paginaAtual,
          limite: limiteAtual,
          ...(usuario ? { usuario } : {}),
          ...(acao ? { acao } : {}),
          ...(sucesso ? { sucesso } : {}),
          ...(dataInicio ? { dataInicio } : {}),
          ...(dataFim ? { dataFim } : {}),
        },
      });
      if (requestId !== requestIdRef.current) return;
      setRegistros(data.dados || data.registros || []);
      setTotal(data.total || 0);
      if (data.pagina && data.pagina !== paginaAtual) alterarPagina(data.pagina);
    } catch (error) {
      if (requestId === requestIdRef.current) {
        setErro(error.response?.data?.msg || error.message || 'Não foi possível carregar a auditoria.');
      }
    } finally {
      if (requestId === requestIdRef.current) setCarregando(false);
    }
  }, [paginaAtual, limiteAtual, usuario, acao, sucesso, dataInicio, dataFim, alterarPagina]);

  useEffect(() => {
    const carregarInicial = async () => { await carregar(); };
    carregarInicial();
  }, [carregar]);

  return (
    <section style={{ maxWidth: 1200, margin: '0 auto' }}>
      <div className="page-heading">
        <div>
          <h1>Auditoria</h1>
          <p>Histórico de autorizações gerenciais e operações registradas no sistema.</p>
        </div>
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
        gap: 12,
        padding: 16,
        marginBottom: 16,
        border: '1px solid var(--border-color)',
        borderRadius: 12,
        background: 'var(--bg-secondary)',
      }}>
        <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)' }}>
          Usuário (nome exato ou ID)
          <input aria-label="Filtrar por usuário" value={usuario} onChange={event => atualizarFiltro('usuario', event.target.value)} style={inputStyle} />
        </label>
        <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)' }}>
          Ação
          <input aria-label="Filtrar por ação" value={acao} onChange={event => atualizarFiltro('acao', event.target.value.toLowerCase())} style={inputStyle} />
        </label>
        <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)' }}>
          Resultado
          <select aria-label="Filtrar por resultado" value={sucesso} onChange={event => atualizarFiltro('sucesso', event.target.value)} style={inputStyle}>
            <option value="">Todos</option>
            <option value="true">Sucesso</option>
            <option value="false">Falha</option>
          </select>
        </label>
        <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)' }}>
          Data inicial
          <DateInput aria-label="Data inicial" value={dataInicio} onChange={value => atualizarFiltro('dataInicio', value)} style={inputStyle} />
        </label>
        <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)' }}>
          Data final
          <DateInput aria-label="Data final" value={dataFim} onChange={value => atualizarFiltro('dataFim', value)} style={inputStyle} />
        </label>
        <button type="button" onClick={limparFiltros} style={{
          alignSelf: 'end',
          minHeight: 40,
          padding: '8px 12px',
          border: '1px solid var(--border-color)',
          borderRadius: 8,
          background: 'var(--bg-tertiary)',
          color: 'var(--text-primary)',
          fontWeight: 700,
          cursor: 'pointer',
        }}>Limpar filtros</button>
      </div>

      <EstadoLista
        carregando={carregando}
        erro={erro}
        vazio={registros.length === 0}
        tituloVazio="Nenhum registro de auditoria"
        mensagemVazia="Ajuste os filtros ou tente novamente mais tarde."
        onRetry={carregar}
      >
        <div style={{ overflowX: 'auto', border: '1px solid var(--border-color)', borderRadius: 12, background: 'var(--bg-secondary)' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                {['Data e hora', 'Ação', 'Solicitante', 'Autorizador', 'Resultado', 'Detalhes', 'IP'].map(coluna => (
                  <th key={coluna} scope="col" style={{ ...cellStyle, background: 'var(--bg-tertiary)', fontWeight: 800 }}>{coluna}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {registros.map(registro => (
                <tr key={registro._id}>
                  <td style={cellStyle}>{new Date(registro.createdAt || registro.data).toLocaleString('pt-BR')}</td>
                  <td style={cellStyle}>{registro.acao}</td>
                  <td style={cellStyle}>{registro.usuarioSolicitante?.username || '—'}</td>
                  <td style={cellStyle}>{registro.usuarioAutorizou?.username || '—'}</td>
                  <td style={{ ...cellStyle, color: registro.sucesso ? 'var(--success-bg)' : 'var(--error-bg)', fontWeight: 700 }}>
                    {registro.sucesso ? 'Sucesso' : 'Falha'}
                    {registro.motivoFalha ? ` · ${registro.motivoFalha}` : ''}
                  </td>
                  <td style={{ ...cellStyle, minWidth: 200, overflowWrap: 'anywhere' }}>{registro.detalhes || '—'}</td>
                  <td style={cellStyle}>{registro.ip || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Paginacao total={total} paginaAtual={paginaAtual} limiteAtual={limiteAtual} onChangePagina={alterarPagina} onChangeLimite={paginacao.alterarLimite} />
      </EstadoLista>
    </section>
  );
}

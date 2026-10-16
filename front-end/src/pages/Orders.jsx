import { useCallback, useState, useEffect, useMemo } from 'react';
import api from '../services/api.jsx';
import { exportarCSV, colunasCSV, dataArquivoCSV } from '../utils/exportarCsv.js';
import { requestAutorizado } from '../services/apiAutorizada.js';
import { useAutorizacaoGerente } from '../hooks/useAutorizacaoGerente.jsx';
import { useToast } from '../components/useToast.js';
import ConfirmarAcao from '../components/ConfirmarAcao.jsx';
import Paginacao from '../components/Paginacao.jsx';
import usePagination from '../hooks/usePagination.js';
import { useNavigate } from 'react-router-dom';
import { useComanda } from '../context/ComandaContext.jsx';
import EstadoLista from '../components/EstadoLista.jsx';

export default function Orders() {
  const navigate = useNavigate();
  const { carregarComanda } = useComanda();
  const [pedidos, setPedidos] = useState([]);
  const [inicio, setInicio] = useState('');
  const [fim, setFim] = useState('');
  const pedidosFiltrados = useMemo(() => pedidos.filter((pedido) => {
    const dia = dataArquivoCSV(new Date(pedido.createdAt));
    return (!inicio || dia >= inicio) && (!fim || dia <= fim);
  }), [pedidos, inicio, fim]);
  const [selecionado, setSelecionado] = useState(null);
  const [filtroStatus, setFiltroStatus] = useState('todos');
  const [carregando, setCarregando] = useState(true);
  const [erroLista, setErroLista] = useState('');
  const [cancelando, setCancelando] = useState(false);
  const { showToast } = useToast();
  const { solicitar: solicitarAutorizacao, renderizarModal: renderizarAutorizacao } = useAutorizacaoGerente('cancelar_venda');
  const paginacao = usePagination(pedidosFiltrados, 25, `${filtroStatus}|${inicio}|${fim}`);

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErroLista('');
    try {
      const url = filtroStatus === 'todos' 
        ? '/orders' 
        : `/orders?status=${filtroStatus}`;
      const res = await api.get(url);
      setPedidos(res.data || []);
    } catch (err) {
      console.error('Erro ao carregar pedidos:', err);
      setErroLista(err.response?.data?.msg || err.message || 'Não foi possível carregar os pedidos.');
    } finally {
      setCarregando(false);
    }
  }, [filtroStatus]);

  useEffect(() => {
    const inicializar = async () => { await carregar(); };
    inicializar();
  }, [carregar]);

  // ✅ Função de cancelamento - AJUSTADA PARA SUA ROTA
  const cancelarPedido = async (pedidoId) => {
    setCancelando(true);
    try {
      await requestAutorizado('patch', `/orders/${pedidoId}/cancelar`, null, 'cancelar_venda', solicitarAutorizacao);
      showToast('Pedido cancelado com sucesso. Estoque devolvido.', 'success');
      setSelecionado(null);
      carregar(); // Recarrega a lista para atualizar o status
    } catch (err) {
      console.error('Erro ao cancelar pedido:', err);
      // ✅ Backend retorna { msg: '...' }
      showToast(err.response?.data?.msg || 'Erro ao cancelar pedido. Tente novamente.', 'error');
    } finally {
      setCancelando(false);
    }
  };

  // ✅ Só permite cancelar se NÃO estiver pago e NÃO já cancelado
  const reabrirComanda = async () => {
    if (!window.confirm('Reabrir esta comanda preservando os recebimentos?')) return;
    setCancelando(true);
    try {
      await api.post(`/comandas/${selecionado.comandaId}/reabrir`);
      await carregarComanda(selecionado.comandaId);
      showToast('Comanda reaberta. Recebimentos preservados.', 'success');
      navigate('/pdv');
    } catch (error) { showToast(error.response?.data?.msg || error.message, 'error'); }
    finally { setCancelando(false); }
  };

  const podeCancelar = (status) => {
    return ['pendente', 'parcial'].includes(status);
  };

  const totalVendido = useMemo(() => {
    if (pedidosFiltrados.length === 0) return 0;

    const soma = pedidosFiltrados.reduce((ac, p) => {
      const valor = parseFloat(
        p.total || 
        p.valorTotal || 
        p.totalPedido || 
        p.valor || 
        p.subtotal || 
        0
      ) || 0;
      return ac + valor;
    }, 0);

    return soma;
  }, [pedidosFiltrados]);
  const filtrosPedidosAtivos = Boolean(filtroStatus !== 'todos' || inicio || fim);
  const acaoListaVazia = useCallback(() => {
    if (filtrosPedidosAtivos) {
      setInicio('');
      setFim('');
      if (filtroStatus !== 'todos') {
        setCarregando(true);
        setFiltroStatus('todos');
      }
      return;
    }
    navigate('/pdv');
  }, [filtrosPedidosAtivos, filtroStatus, navigate]);

  const getStatusInfo = (status) => {
    const map = {
      pendente: { cor: 'var(--warning-bg)', texto: 'Pendente' },
      pago: { cor: 'var(--success-bg)', texto: 'Pago' },
      parcial: { cor: 'var(--info-bg)', texto: 'Parcial' },
      cancelado: { cor: 'var(--error-bg)', texto: 'Cancelado' }
    };
    return map[status] || { cor: 'var(--text-tertiary)', texto: status || '—' };
  };

  return (
    <div>
      {renderizarAutorizacao()}
      <div className="page-heading">
        <div>
          <h1>📋 Histórico de Pedidos</h1>
          <p>Acompanhe todas as vendas realizadas</p>
        </div>
        <button type="button" disabled={carregando} onClick={() => exportarCSV(pedidosFiltrados.map((pedido) => ({ ...pedido, createdAt: new Date(pedido.createdAt), total: Number(pedido.total ?? pedido.valorTotal ?? pedido.totalPedido ?? pedido.valor ?? pedido.subtotal ?? 0) })), colunasCSV.vendas, `vendas_${dataArquivoCSV()}.csv`)}>Exportar CSV</button>
      </div>

      <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <label>De <input type="date" value={inicio} max={fim || undefined} onChange={(event) => setInicio(event.target.value)} /></label>
        <label>Até <input type="date" value={fim} min={inicio || undefined} onChange={(event) => setFim(event.target.value)} /></label>
      </div>

      {/* FILTRO DE STATUS */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: 16, flexWrap: 'wrap' }}>
        {[
          { valor: 'todos', label: '📋 Todos' },
          { valor: 'pendente', label: '⏳ Pendentes' },
          { valor: 'parcial', label: '💰 Parciais' },
          { valor: 'pago', label: '✅ Pagos' },
          { valor: 'cancelado', label: '❌ Cancelados' }
        ].map(item => (
          <button
            key={item.valor}
            onClick={() => { setCarregando(true); setFiltroStatus(item.valor); }}
            style={{
              padding: '6px 14px', borderRadius: '20px', border: 'none',
              fontSize: '12px', fontWeight: filtroStatus === item.valor ? '700' : '500',
              cursor: 'pointer', transition: 'all 0.2s',
              background: filtroStatus === item.valor ? 'var(--accent-primary)' : 'var(--bg-tertiary)',
              color: filtroStatus === item.valor ? '#fff' : 'var(--text-secondary)'
            }}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: 16, padding: 16, boxShadow: 'var(--shadow-sm)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, flexWrap: 'wrap', gap: 10 }}>
          <h3 style={{ fontSize: 15, fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
            Pedidos
            <span style={{ background: 'var(--accent-light)', color: 'var(--accent-primary)', padding: '3px 10px', borderRadius: 20, fontSize: 12, fontWeight: 600 }}>
              {pedidosFiltrados.length}
            </span>
          </h3>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Total vendido:</span>
            <span style={{ fontWeight: 700, color: 'var(--success-bg)', fontSize: 16 }}>
              {carregando ? (
                <span style={{ color: 'var(--text-tertiary)' }}>Carregando...</span>
              ) : (
                `R$ ${totalVendido.toFixed(2).replace('.', ',')}`
              )}
            </span>
          </div>
        </div>

        <EstadoLista
          carregando={carregando}
          erro={erroLista}
          vazio={pedidosFiltrados.length === 0}
          tituloVazio={filtrosPedidosAtivos ? 'Nenhum pedido corresponde aos filtros' : 'Nenhum pedido realizado'}
          mensagemVazia={filtrosPedidosAtivos
            ? 'Limpe os filtros para voltar a consultar todos os pedidos.'
            : 'As vendas concluídas aparecerão aqui.'}
          acaoVaziaTexto={filtrosPedidosAtivos ? 'Limpar filtros' : 'Ir ao PDV'}
          onAcaoVazia={acaoListaVazia}
          onRetry={() => { void carregar(); }}
        >
          <>
            <div style={{ overflowX: 'auto', margin: '0 -16px', padding: '0 16px' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 650 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                    {['Nº', 'Data', 'Status', 'Cliente', 'Itens', 'Total', 'Ver'].map(h => (
                      <th key={h} style={{ padding: '10px 8px', textAlign: ['Total','Ver'].includes(h) ? 'right' : 'left', fontSize: 11, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '.05em' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {paginacao.itensPagina.map(p => {
                  const statusInfo = getStatusInfo(p.status);
                  const valorTotal = Number(p?.total || p?.valorTotal || p?.subtotal || 0);
                  return (
                    <tr key={p._id} style={{ borderBottom: '1px solid var(--border-light)' }}>
                      <td style={{ padding: '10px 8px', fontFamily: 'monospace', fontWeight: 700, fontSize: 13 }}>#{p.numero}</td>
                      <td style={{ padding: '10px 8px', fontSize: 12, color: 'var(--text-secondary)' }}>
                        {new Date(p.createdAt).toLocaleDateString('pt-BR')} {new Date(p.createdAt).toLocaleTimeString('pt-BR').slice(0, 5)}
                      </td>
                      <td style={{ padding: '10px 8px' }}>
                        <span style={{
                          padding: '3px 8px', borderRadius: '12px', fontSize: '11px', fontWeight: 600,
                          background: `${statusInfo.cor}15`, color: statusInfo.cor, whiteSpace: 'nowrap'
                        }}>
                          {statusInfo.texto}
                        </span>
                      </td>
                      <td style={{ padding: '10px 8px', fontSize: 13, maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.clienteNome}</td>
                      <td style={{ padding: '10px 8px', textAlign: 'right', fontSize: 13 }}>{p.itens?.length || 0}</td>
                      <td style={{ padding: '10px 8px', textAlign: 'right', fontWeight: 700, color: 'var(--accent-primary)', fontVariantNumeric: 'tabular-nums' }}>
                        R$ {valorTotal.toFixed(2).replace('.', ',')}
                      </td>
                      <td style={{ padding: '10px 8px', textAlign: 'right' }}>
                        <button onClick={() => setSelecionado(p)} style={{
                          padding: '6px 14px', background: 'var(--accent-light)', color: 'var(--accent-primary)',
                          border: '1px solid var(--accent-border)', borderRadius: 8, fontSize: 12,
                          fontWeight: 600, cursor: 'pointer', minHeight: 34
                        }}>Detalhes</button>
                      </td>
                    </tr>
                  );
                })}
                </tbody>
              </table>
            </div>
            <Paginacao total={paginacao.total} paginaAtual={paginacao.paginaAtual} limiteAtual={paginacao.limiteAtual} onChangePagina={paginacao.alterarPagina} onChangeLimite={paginacao.alterarLimite} />
          </>
        </EstadoLista>
      </div>

      {/* Modal Detalhes */}
      {selecionado && (
        <div onClick={() => setSelecionado(null)} style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)',
          display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
          zIndex: 100, padding: 0
        }} className="modal-bg">
          <div onClick={e => e.stopPropagation()} style={{
            background: 'var(--bg-secondary)', borderRadius: '20px 20px 0 0', width: '100%', maxWidth: 500,
            maxHeight: '85vh', overflowY: 'auto', padding: 24
          }} className="modal-inner">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div>
                <h3 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 4px 0' }}>Pedido #{selecionado.numero}</h3>
                <span style={{ fontSize: '13px', fontWeight: 600, color: getStatusInfo(selecionado.status).cor }}>
                  {getStatusInfo(selecionado.status).texto}
                </span>
              </div>
              <button onClick={() => setSelecionado(null)} style={{
                background: 'transparent', border: 'none', fontSize: 26,
                color: 'var(--text-secondary)', cursor: 'pointer', minWidth: 44, minHeight: 44
              }}>×</button>
            </div>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 12 }}>
              📅 {new Date(selecionado.createdAt).toLocaleString('pt-BR')}<br />
              👤 {selecionado.clienteNome}<br />
              💼 Atendente: {selecionado.atendente || '—'}
            </div>
            <div style={{ borderTop: '1px solid var(--border-light)', paddingTop: 10, marginBottom: 10 }}>
              {(selecionado.itens || []).map((item, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px dashed var(--border-light)' }}>
                  <div style={{ paddingRight: 10 }}>
                    <div style={{ fontWeight: 700, fontSize: 14 }}>{item.nome}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                      {item.quantidade} × R$ {Number(item.precoUnitario || 0).toFixed(2).replace('.', ',')}
                    </div>
                  </div>
                  <div style={{ fontWeight: 700, fontSize: 14, flexShrink: 0 }}>
                    R$ {Number((item.quantidade || 0) * (item.precoUnitario || 0)).toFixed(2).replace('.', ',')}
                  </div>
                </div>
              ))}
            </div>
            <div style={{ borderTop: '2px solid var(--accent-primary)', paddingTop: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, color: 'var(--text-secondary)', marginBottom: 4 }}>
                <span>Subtotal</span>
                <span>R$ {Number(selecionado.subtotal || 0).toFixed(2).replace('.', ',')}</span>
              </div>
              {(selecionado.desconto || 0) > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, color: 'var(--success-bg)', marginBottom: 4 }}>
                  <span>Desconto</span>
                  <span>-R$ {Number(selecionado.desconto || 0).toFixed(2).replace('.', ',')}</span>
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, fontSize: 22, color: 'var(--accent-primary)', marginTop: 8 }}>
                <span>Total</span>
                <span>R$ {Number(selecionado.total || selecionado.valorTotal || 0).toFixed(2).replace('.', ',')}</span>
              </div>
            </div>

            {selecionado.comandaId && selecionado.status !== 'cancelado' && <button type="button" onClick={reabrirComanda} disabled={cancelando}>🔒 Reabrir comanda</button>}
            {/* ✅ BOTÃO CANCELAR — SÓ APARECE SE PENDENTE OU PARCIAL */}
            {podeCancelar(selecionado.status) && (
              <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--border-light)' }}>
                <ConfirmarAcao
                  titulo="Cancelar pedido"
                  mensagem="Tem certeza que deseja cancelar este pedido? O estoque será devolvido automaticamente."
                  acaoTexto="Cancelar pedido"
                  onConfirmar={() => cancelarPedido(selecionado._id)}
                >
                  {({ onClick }) => (
                    <button
                      onClick={onClick}
                      disabled={cancelando}
                      style={{
                        width: '100%',
                        padding: '12px',
                        background: cancelando ? 'var(--bg-tertiary)' : 'var(--error-bg)',
                        color: '#fff',
                        border: 'none',
                        borderRadius: 10,
                        fontSize: 14,
                        fontWeight: 600,
                        cursor: cancelando ? 'not-allowed' : 'pointer',
                        transition: 'background 0.2s'
                      }}
                    >
                      {cancelando ? '⏳ Cancelando...' : '❌ Cancelar Pedido'}
                    </button>
                  )}
                </ConfirmarAcao>
              </div>
            )}
          </div>
        </div>
      )}

      <style>{`
        @media (min-width: 640px) {
          .modal-bg { align-items: center !important; padding: 20px !important; }
          .modal-inner { border-radius: 16px !important; }
        }
      `}</style>
    </div>
  );
}

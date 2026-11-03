import FieldLabel from '../components/FieldLabel.jsx';
import SearchableSelect from '../components/SearchableSelect.jsx';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import api from '../services/api.jsx';
import Paginacao from '../components/Paginacao.jsx';
import useUrlPagination from '../hooks/useUrlPagination.js';
import { updatePaginationParams } from '../utils/paginationUrl.js';
import ConfirmarAcao from '../components/ConfirmarAcao.jsx';
import EstadoLista from '../components/EstadoLista.jsx';
import { useToast } from '../components/useToast.js';
import { imprimirEntrega } from '../utils/imprimirEntrega.js';
import '../styles/delivery.css';

const STATUS_NOMES = {
  pendente: 'Aguardando preparo',
  pronto: 'Pronto para despachar',
  despachado: 'Aguardando retirada',
  a_caminho: 'A caminho',
  entregue: 'Entregue',
  cancelado: 'Cancelado',
};
const moeda = valor => Number(valor || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const enderecoTexto = endereco => [endereco?.rua, endereco?.numero, endereco?.bairro, endereco?.complemento].filter(Boolean).join(', ');
const idadeMinutos = (data, referencia = Date.now()) => Math.max(0, Math.floor((referencia - new Date(data).getTime()) / 60000));

function minutosNoStatus(pedido, status, agora) {
  const evento = [...(pedido.statusHistorico || [])].reverse().find(item => item.status === status);
  if (!evento?.data) return null;
  const data = new Date(evento.data).getTime();
  return Number.isFinite(data) ? idadeMinutos(data, agora) : null;
}

function faixaAtraso(minutos) {
  return minutos !== null && minutos > 10 ? 'vermelho' : '';
}

export default function Entregas() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const pedidoDestacado = searchParams.get('pedido');
  const [pedidos, setPedidos] = useState([]);
  const [entregadores, setEntregadores] = useState([]);
  const [estatisticas, setEstatisticas] = useState({});
  const [comercio, setComercio] = useState(null);
  const [selecao, setSelecao] = useState({});
  const [aba, setAba] = useState('fila');
  const [filaAba, setFilaAba] = useState('prontos');
  const [filtroStatus, setFiltroStatus] = useState(() => searchParams.get('status') || '');
  const [filtroData, setFiltroData] = useState(() => searchParams.get('data') || '');
  const [totalPedidos, setTotalPedidos] = useState(0);
  const [entregadorEdicao, setEntregadorEdicao] = useState(null);
  const [whatsapp, setWhatsapp] = useState(null);
  const [erro, setErro] = useState('');
  const [erroLista, setErroLista] = useState('');
  const [aviso, setAviso] = useState('');
  const [motivoCancelamento, setMotivoCancelamento] = useState('');
  const [carregando, setCarregando] = useState(true);
  const [agora, setAgora] = useState(Date.now);
  const [ocupado, setOcupado] = useState(false);
  const [despachando, setDespachando] = useState('');
  const carregamentoRequestId = useRef(0);
  const pedidoFocado = useRef(null);
  const paginacaoHistorico = useUrlPagination();
  const { paginaAtual, limiteAtual } = paginacaoHistorico;

  const carregar = useCallback(async (silencioso = false) => {
    const requestId = ++carregamentoRequestId.current;
    if (!silencioso) setCarregando(true);
    try {
      const query = new URLSearchParams({ pagina: String(aba === 'historico' ? paginaAtual : 1), limite: String(aba === 'historico' ? limiteAtual : 100) });
      if (aba === 'historico') {
        if (filtroStatus) query.set('status', filtroStatus);
        if (filtroData) query.set('data', filtroData);
      }
      const [pedidosResponse, entregadoresResponse, estatisticasResponse, comercioResponse] = await Promise.all([
        api.get(`/entregas/pedidos?${query}`, { pdvSilenciosa: silencioso }),
        api.get('/entregas/entregadores', { pdvSilenciosa: silencioso }),
        api.get('/entregas/estatisticas', { pdvSilenciosa: silencioso }),
        api.get('/entregas/configuracao', { pdvSilenciosa: silencioso }),
      ]);
      if (requestId !== carregamentoRequestId.current) return;
      setPedidos(pedidosResponse.data.pedidos || []);
      setTotalPedidos(pedidosResponse.data.total || 0);
      setEntregadores(entregadoresResponse.data || []);
      setEstatisticas(estatisticasResponse.data || {});
      setComercio(comercioResponse.data || null);
      setAgora(Date.now());
      setErroLista('');
    } catch (error) {
      if (requestId === carregamentoRequestId.current) {
        setErroLista(error.response?.data?.msg || 'Não foi possível carregar as entregas.');
      }
    } finally {
      if (requestId === carregamentoRequestId.current) setCarregando(false);
    }
  }, [aba, filtroData, filtroStatus, paginaAtual, limiteAtual]);

  useEffect(() => {
    const iniciar = window.setTimeout(() => { void carregar(); }, 0);
    const polling = window.setInterval(() => { void carregar(true); }, 15000);
    const relogio = window.setInterval(() => setAgora(Date.now()), 60000);
    return () => {
      window.clearTimeout(iniciar);
      window.clearInterval(polling);
      window.clearInterval(relogio);
    };
  }, [carregar]);

  const atualizarFiltroHistorico = (nome, valor, atualizarEstado) => {
    atualizarEstado(valor);
    setSearchParams((current) => {
      const next = updatePaginationParams(current, { pagina: 1 });
      if (!valor) next.delete(nome);
      else next.set(nome, valor);
      return next;
    }, { replace: true });
  };

  useEffect(() => {
    if (!pedidoDestacado || pedidoFocado.current === pedidoDestacado) return undefined;
    const pedido = pedidos.find(item => item._id === pedidoDestacado);
    if (!pedido) return undefined;
    let rolagem;
    const quadro = window.requestAnimationFrame(() => {
      pedidoFocado.current = pedidoDestacado;
      setAba('fila');
      setFilaAba(pedido.status === 'pronto' ? 'prontos' : pedido.status === 'pendente' ? 'preparo' : 'em-entrega');
      rolagem = window.requestAnimationFrame(() => {
        document.getElementById(`pedido-${pedido._id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      });
    });
    return () => {
      window.cancelAnimationFrame(quadro);
      if (rolagem !== undefined) window.cancelAnimationFrame(rolagem);
    };
  }, [pedidoDestacado, pedidos]);

  const prontos = useMemo(() => pedidos.filter(pedido => pedido.status === 'pronto'), [pedidos]);
  const emEntrega = useMemo(() => pedidos.filter(pedido => ['despachado', 'a_caminho'].includes(pedido.status)), [pedidos]);
  const aguardandoPreparo = useMemo(() => pedidos.filter(pedido => pedido.status === 'pendente'), [pedidos]);
  const pedidosDaFila = filaAba === 'prontos' ? prontos : filaAba === 'em-entrega' ? emEntrega : aguardandoPreparo;

  const executar = async (acao, sucesso) => {
    if (ocupado) return false;
    setOcupado(true);
    setErro('');
    setAviso('');
    try {
      await acao();
      if (sucesso) {
        setAviso(sucesso);
        showToast(sucesso, 'success');
      }
      await carregar(true);
      return true;
    } catch (error) {
      const mensagem = error.response?.data?.msg || 'Não foi possível concluir a operação.';
      setErro(mensagem);
      showToast(mensagem, 'error');
      return false;
    } finally {
      setOcupado(false);
      setDespachando('');
    }
  };

  const iniciarNovaVenda = () => navigate('/pdv');

  const despachar = async pedido => {
    const entregadorId = selecao[pedido._id];
    if (!entregadorId) {
      setErro('Selecione um entregador disponível antes de despachar.');
      return;
    }
    setDespachando(pedido._id);
    await executar(async () => {
      const { data } = await api.post(`/entregas/pedidos/${pedido._id}/despachar`, { entregadorId });
      setWhatsapp(data.whatsapp || null);
      setSelecao(atual => {
        const proxima = { ...atual };
        delete proxima[pedido._id];
        return proxima;
      });
    }, `Pedido de ${pedido.origem.nomeCliente} despachado.`);
  };

  const enviarWhatsApp = async pedido => {
    await executar(async () => {
      const { data } = await api.post(`/entregas/pedidos/${pedido._id}/enviar-whatsapp`, {});
      setWhatsapp(data);
    }, 'Mensagem de rastreamento pronta para compartilhar.');
  };

  const cancelar = (pedido, motivo) => executar(
    () => api.post(`/entregas/pedidos/${pedido._id}/cancelar`, { motivo }),
    'Pedido cancelado.'
  );

  const marcarPronto = pedido => {
    void executar(() => api.post(`/entregas/pedidos/${pedido._id}/pronto`, {}), 'Pedido marcado como pronto.');
  };

  const salvarEntregador = event => {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const body = {
      nome: form.get('nome'),
      telefone: form.get('telefone'),
      ativo: form.get('ativo') === 'on',
    };
    if (form.get('senha')) body.senha = form.get('senha');
    const mensagemSucesso = entregadorEdicao
      ? 'Entregador atualizado.'
      : 'Entregador cadastrado. Compartilhe a senha temporária com ele.';
    void executar(async () => {
      if (entregadorEdicao) {
        await api.put(`/entregas/entregadores/${entregadorEdicao._id}`, body);
      } else {
        body.senha = form.get('senha');
        await api.post('/entregas/entregadores', body);
      }
      setEntregadorEdicao(null);
      formElement.reset();
    }, mensagemSucesso);
  };

  const excluirEntregador = entregador => {
    void executar(() => api.delete(`/entregas/entregadores/${entregador._id}`), 'Entregador excluído.');
  };

  const salvarConfiguracao = event => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    void executar(
      () => api.put('/entregas/configuracao', {
        nome: form.get('nome'),
        telefone: form.get('telefone'),
        endereco: form.get('endereco'),
        taxaEntregaPadrao: Number(form.get('taxaEntregaPadrao')),
        tempoEstimadoPadraoMin: Number(form.get('tempo')),
        mensagemWhatsApp: form.get('mensagem'),
      }),
      'Configurações salvas.'
    );
  };

  const copiarMensagem = async () => {
    if (!whatsapp?.mensagemPronta) return;
    try {
      await navigator.clipboard.writeText(whatsapp.mensagemPronta);
      setAviso('Mensagem copiada.');
    } catch {
      setAviso('Selecione a mensagem para copiar.');
    }
  };

  return <div className="delivery-app delivery-board">
    <header className="delivery-board-heading page-heading">
      <div><span className="dashboard-eyebrow">OPERAÇÃO DO DIA</span><h1>Entregas</h1><p>Acompanhe e despache os pedidos do seu comércio.</p></div>
      <span className="delivery-muted" role="status">Atualização automática a cada 15 segundos</span>
    </header>

    <section className="delivery-stats" aria-label="Resumo das entregas">
      {[['Pendentes', estatisticas.pendentes || 0], ['Prontos', estatisticas.prontos || 0], ['Em entrega', estatisticas.emEntrega || 0], ['Entregues hoje', estatisticas.entregues || 0], ['Tempo médio', `${estatisticas.tempoMedioMin || 0} min`]].map(([label, value]) =>
        <article className="delivery-card delivery-stat" key={label}><span>{label}</span><strong>{value}</strong></article>
      )}
    </section>

    {erro && <p role="alert" className="delivery-error">{erro}</p>}
    {aviso && <p role="status" className="delivery-success">{aviso}</p>}

    {whatsapp && <section className="delivery-card" aria-label="Mensagem de rastreamento">
      <h2>Link para o cliente</h2>
      <p className="delivery-muted">{whatsapp.enviado ? 'Mensagem enviada pelo WhatsApp configurado.' : 'Abra o WhatsApp ou copie a mensagem para enviar ao cliente.'}</p>
      <textarea aria-label="Mensagem de rastreamento" readOnly value={whatsapp.mensagemPronta || ''} />
      <div className="delivery-actions">
        {whatsapp.whatsappUrl && <a className="delivery-button" href={whatsapp.whatsappUrl} target="_blank" rel="noreferrer">Abrir WhatsApp</a>}
        <button type="button" className="delivery-secondary" onClick={() => void copiarMensagem()}>Copiar mensagem</button>
        <button type="button" className="delivery-secondary" onClick={() => setWhatsapp(null)}>Fechar</button>
      </div>
    </section>}

    <nav className="delivery-tabs" aria-label="Gestão de entregas">
      {[['fila', 'Fila de entregas'], ['novo', 'Novo pedido'], ['historico', 'Histórico'], ['entregadores', 'Entregadores'], ['configuracao', 'Configurações']].map(([id, label]) =>
        <button key={id} type="button" aria-selected={id !== 'novo' && aba === id} onClick={() => {
          if (id === 'novo') {
            iniciarNovaVenda();
            return;
          }
          setAba(id);
          paginacaoHistorico.alterarPagina(1);
        }}>{label}</button>
      )}
    </nav>

    {aba === 'fila' && <nav className="delivery-tabs" aria-label="Status da fila">
      <button type="button" aria-selected={filaAba === 'prontos'} onClick={() => setFilaAba('prontos')}>Prontos para despachar ({prontos.length})</button>
      <button type="button" aria-selected={filaAba === 'em-entrega'} onClick={() => setFilaAba('em-entrega')}>Em entrega ({emEntrega.length})</button>
      <button type="button" aria-selected={filaAba === 'preparo'} onClick={() => setFilaAba('preparo')}>Aguardando preparo ({aguardandoPreparo.length})</button>
    </nav>}

    {aba === 'historico' && <div className="delivery-form-grid">
      <label>Status
        <SearchableSelect value={filtroStatus} onChange={event => atualizarFiltroHistorico('status', event.target.value, setFiltroStatus)}>
          <option value="">Todos</option>{Object.entries(STATUS_NOMES).map(([id, nome]) => <option key={id} value={id}>{nome}</option>)}
        </SearchableSelect>
      </label>
      <label>Data<input type="date" value={filtroData} onChange={event => atualizarFiltroHistorico('data', event.target.value, setFiltroData)} /></label>
    </div>}

    {aba === 'entregadores' && <section className="delivery-grid">
      <form className="delivery-card" onSubmit={salvarEntregador} key={entregadorEdicao?._id || 'novo-entregador'}>
        <h2>{entregadorEdicao ? 'Editar entregador' : 'Cadastrar entregador'}</h2>
        <label>Nome<input name="nome" required maxLength={160} defaultValue={entregadorEdicao?.nome || ''} /></label>
        <label>Telefone<input name="telefone" type="tel" required maxLength={30} defaultValue={entregadorEdicao?.telefone || ''} /></label>
        <label>Senha temporária<input name="senha" type="password" autoComplete="new-password" required={!entregadorEdicao} minLength={8} /></label>
        <label><span>Ativo</span><input name="ativo" type="checkbox" defaultChecked={entregadorEdicao?.ativo !== false} /></label>
        <div className="delivery-actions"><button disabled={ocupado}>{entregadorEdicao ? 'Salvar alterações' : 'Cadastrar entregador'}</button>{entregadorEdicao && <button type="button" className="delivery-secondary" onClick={() => setEntregadorEdicao(null)}>Cancelar edição</button>}</div>
      </form>
      <div>
        <div className="delivery-grid">
        {entregadores.map(entregador => {
          const pertenceAoComercio = String(entregador.tenantId) === String(comercio?._id);
          return <article className="delivery-card" key={entregador._id}>
          <span className="delivery-badge">{!pertenceAoComercio ? 'Livre · compartilhado' : entregador.ativo === false ? 'Desativado' : entregador.status}</span>
          <h2>{entregador.nome}</h2><p><a href={`tel:${entregador.telefone}`}>{entregador.telefone}</a></p>
          {pertenceAoComercio && <div className="delivery-actions"><button type="button" className="delivery-secondary" onClick={() => setEntregadorEdicao(entregador)}>Editar</button><ConfirmarAcao titulo="Excluir entregador" mensagem={`Excluir ${entregador.nome}? Se houver pedidos associados, o cadastro deverá ser desativado.`} acaoTexto="Excluir entregador" onConfirmar={() => excluirEntregador(entregador)}>{({ onClick }) => <button type="button" className="delivery-danger" disabled={ocupado} onClick={onClick}>Excluir</button>}</ConfirmarAcao></div>}
        </article>;
        })}
        {!entregadores.length && <p className="delivery-empty">Nenhum entregador cadastrado.</p>}
        </div>
      </div>
    </section>}

    {aba === 'configuracao' && comercio && <form className="delivery-card" onSubmit={salvarConfiguracao} key={comercio._id}>
      <h2>Configurações de entrega</h2>
      <label>Nome do comércio<input name="nome" required maxLength={160} defaultValue={comercio.nome} /></label>
      <label>Telefone do comércio<input name="telefone" type="tel" required maxLength={30} defaultValue={comercio.telefone} /></label>
      <label>Endereço do comércio<textarea name="endereco" required maxLength={500} defaultValue={comercio.endereco} /></label>
      <label>Taxa padrão de entrega (R$)<input name="taxaEntregaPadrao" type="number" min="0" step="0.01" required defaultValue={comercio.taxaEntregaPadrao ?? comercio.taxaPorEntrega ?? 0} /></label>
      <label>Tempo estimado padrão (minutos)<input name="tempo" type="number" min="1" step="1" required defaultValue={comercio.configuracao.tempoEstimadoPadraoMin} /></label>
      <label><FieldLabel hint={<> Use {'{link}'} no ponto onde deve aparecer o rastreamento. </>}> Mensagem para o cliente </FieldLabel><textarea name="mensagem" required maxLength={1000} defaultValue={comercio.configuracao.mensagemWhatsApp} /></label>
      
      <button disabled={ocupado}>{ocupado ? 'Salvando…' : 'Salvar configurações'}</button>
    </form>}

    {['fila', 'historico'].includes(aba) && <EstadoLista
      carregando={carregando}
      erro={erroLista}
      vazio={(aba === 'historico' ? pedidos : pedidosDaFila).length === 0}
      onRetry={() => void carregar()}
      tituloVazio={aba === 'historico' ? 'Nenhum pedido encontrado para este filtro.' : 'Não há pedidos nesta etapa.'}
      mensagemVazia={aba === 'fila' ? 'Os pedidos aparecerão aqui conforme avançarem na operação.' : undefined}
      acaoVaziaTexto={aba === 'fila' ? 'Criar pedido' : undefined}
      onAcaoVazia={aba === 'fila' ? iniciarNovaVenda : undefined}
    >
      <section className="delivery-grid">
        {(aba === 'historico' ? pedidos : pedidosDaFila).map(pedido => {
          const entregador = typeof pedido.entregadorId === 'object' ? pedido.entregadorId : null;
          const endereco = enderecoTexto(pedido.origem.endereco);
          const podeCancelar = ['pendente', 'pronto', 'despachado'].includes(pedido.status);
          const minutosPronto = pedido.status === 'pronto' ? minutosNoStatus(pedido, 'pronto', agora) : null;
          const atrasoSla = aba === 'fila' && pedido.status === 'pronto' && minutosPronto !== null && minutosPronto > 10;
          return <article className={`delivery-card delivery-order ${aba === 'fila' && pedido.status === 'pronto' ? faixaAtraso(minutosPronto) : ''}`} key={pedido._id} id={`pedido-${pedido._id}`} aria-current={pedido._id === pedidoDestacado ? 'true' : undefined}>
            <div className="delivery-order-heading"><div><span className="delivery-badge">{STATUS_NOMES[pedido.status]}</span>{atrasoSla && <span className="delivery-badge delivery-sla-alert" role="status">Atraso · SLA de 10 min</span>}<h2>{pedido.origem.nomeCliente}</h2></div><span>{pedido.status === 'pronto' ? (minutosPronto === null ? 'Tempo no status indisponível' : `Pronto há ${minutosPronto} min`) : `${idadeMinutos(pedido.criadoEm, agora)} min`}</span></div>
            <p><strong>Endereço:</strong> {endereco}</p>
            <p><strong>Telefone:</strong> <a href={`tel:${pedido.origem.telefone}`}>{pedido.origem.telefone}</a></p>
            <p><strong>Valor:</strong> {moeda(Number(pedido.valorTotal || 0) + Number(pedido.taxaEntrega || 0))}</p>
            {entregador && <p><strong>Entregador:</strong> {entregador.nome}</p>}
            {pedido.status === 'pronto' && <div className="delivery-actions">
              <label className="delivery-dispatch-label">Entregador disponível
                <SearchableSelect value={selecao[pedido._id] || ''} onChange={event => setSelecao(atual => ({ ...atual, [pedido._id]: event.target.value }))}>
                  <option value="">Selecione…</option>
                  {entregadores.filter(item => item.ativo !== false && ['disponivel', 'em_entrega'].includes(item.status)).map(item => <option key={item._id} value={item._id}>{item.nome}{item.status === 'em_entrega' ? ' · em entrega' : ''}</option>)}
                </SearchableSelect>
              </label>
              <button type="button" disabled={despachando === pedido._id || !selecao[pedido._id]} onClick={() => void despachar(pedido)}>{despachando === pedido._id ? 'Despachando…' : 'Despachar'}</button>
            </div>}
            {pedido.status === 'pendente' && <button type="button" disabled={ocupado} onClick={() => marcarPronto(pedido)}>Marcar como pronto</button>}
            <div className="delivery-actions">
              {pedido.tokenRastreamento && <button type="button" className="delivery-secondary" onClick={() => navigate(`/pedido/${pedido.tokenRastreamento}`)}>Ver rastreio</button>}
              {aba === 'historico' && <button type="button" className="delivery-secondary" onClick={() => {
                if (!imprimirEntrega(pedido, comercio?.nome)) setErro('Permita janelas pop-up para imprimir o pedido.');
              }}>Reimprimir</button>}
              <button type="button" className="delivery-secondary" disabled={ocupado} onClick={() => void enviarWhatsApp(pedido)}>WhatsApp</button>
              {podeCancelar && <ConfirmarAcao titulo="Cancelar pedido de entrega" mensagem={`Cancelar o pedido de ${pedido.origem.nomeCliente}? Motivo: ${motivoCancelamento}`} acaoTexto="Confirmar cancelamento" onConfirmar={() => cancelar(pedido, motivoCancelamento)}>{({ onClick }) => <button type="button" className="delivery-danger" disabled={ocupado} onClick={() => {
                const motivo = window.prompt('Qual o motivo do cancelamento?');
                if (!motivo?.trim()) return;
                setMotivoCancelamento(motivo.trim());
                onClick();
              }}>Cancelar</button>}</ConfirmarAcao>}
            </div>
          </article>;
        })}
      </section>
    </EstadoLista>}

    {aba === 'historico' && <Paginacao total={totalPedidos} paginaAtual={paginaAtual} limiteAtual={limiteAtual} onChangePagina={paginacaoHistorico.alterarPagina} onChangeLimite={paginacaoHistorico.alterarLimite} />}

  </div>;
}

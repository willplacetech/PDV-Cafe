import { useCallback, useEffect, useRef, useState } from 'react';
import DeliveryPortal from '../components/DeliveryPortal.jsx';
import { courierApi, erroDelivery } from '../services/deliveryApi.js';

function PainelEntregador() {
  const [dados, setDados] = useState({ pedidos: [], status: 'offline' });
  const [dadosCarregados, setDadosCarregados] = useState(false);
  const [erro, setErro] = useState('');
  const [erroLocalizacao, setErroLocalizacao] = useState('');
  const [aviso, setAviso] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const ultimaPosicaoRef = useRef(null);
  useEffect(() => {
    ultimaPosicaoRef.current = dados.posicaoAtual?.atualizadoEm || null;
  }, [dados.posicaoAtual?.atualizadoEm]);
  const carregar = useCallback(async () => {
    try { const { data } = await courierApi.get('/entregador/pedidos'); setDados(data); setDadosCarregados(true); setErro(''); }
    catch (error) { setErro(erroDelivery(error)); }
  }, []);
  useEffect(() => { const inicio = setTimeout(() => { void carregar(); }, 0); const timer = setInterval(carregar, 15000); return () => { clearTimeout(inicio); clearInterval(timer); }; }, [carregar]);
  useEffect(() => {
    if (!dadosCarregados) return undefined;
    let ativo = true;
    let timer = null;
    let solicitando = false;
    const agendar = (atraso) => {
      window.clearTimeout(timer);
      if (ativo && document.visibilityState === 'visible') {
        timer = window.setTimeout(atualizarPosicao, atraso);
      }
    };
    const agendarProxima = () => {
      const ultimaAtualizacao = ultimaPosicaoRef.current ? new Date(ultimaPosicaoRef.current).getTime() : 0;
      agendar(Math.max(0, ultimaAtualizacao + 30250 - Date.now()));
    };
    const atualizarPosicao = () => {
      if (!ativo || document.visibilityState !== 'visible' || solicitando) return;
      const ultimaAtualizacao = ultimaPosicaoRef.current ? new Date(ultimaPosicaoRef.current).getTime() : 0;
      if (Date.now() - ultimaAtualizacao < 30250) {
        agendarProxima();
        return;
      }
      if (!navigator.geolocation) {
        setErroLocalizacao('Este navegador não oferece localização. Abra o app em um navegador com suporte à geolocalização.');
        agendar(30000);
        return;
      }
      solicitando = true;
      navigator.geolocation.getCurrentPosition(async position => {
        if (!ativo || document.visibilityState !== 'visible') {
          solicitando = false;
          return;
        }
        try {
          const { data } = await courierApi.post('/entregador/posicao', {
            lat: position.coords.latitude,
            lng: position.coords.longitude,
          });
          if (ativo) {
            setDados(atual => ({
              ...atual,
              posicaoAtual: { lat: position.coords.latitude, lng: position.coords.longitude, atualizadoEm: data.atualizadoEm },
            }));
            ultimaPosicaoRef.current = data.atualizadoEm;
            setErroLocalizacao('');
          }
        } catch (error) {
          if (ativo) setErroLocalizacao(erroDelivery(error));
        } finally {
          solicitando = false;
          agendarProxima();
        }
      }, error => {
        solicitando = false;
        if (!ativo) return;
        const mensagens = {
          1: 'Permita o acesso à localização nas configurações do navegador para compartilhar sua posição enquanto o app estiver aberto.',
          2: 'A localização está indisponível. Verifique o GPS e a conexão do aparelho.',
          3: 'A leitura da localização demorou demais. O app tentará novamente automaticamente.',
        };
        setErroLocalizacao(mensagens[error.code] || 'Não foi possível obter a localização. O app tentará novamente automaticamente.');
        agendar(30000);
      }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 });
    };
    const aoAlterarVisibilidade = () => {
      if (document.visibilityState === 'visible') agendarProxima();
      else window.clearTimeout(timer);
    };
    agendarProxima();
    document.addEventListener('visibilitychange', aoAlterarVisibilidade);
    return () => {
      ativo = false;
      window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', aoAlterarVisibilidade);
    };
  }, [dadosCarregados]);
  const agir = async (url, body, mensagem, aposSucesso) => {
    if (ocupado) return;
    setOcupado(true); setErro('');
    try { const { data } = await courierApi.post(url, body); aposSucesso?.(data); setAviso(mensagem); await carregar(); }
    catch (error) { setErro(erroDelivery(error)); }
    finally { setOcupado(false); }
  };
  return <><p className="delivery-eyebrow">SEU DIA NA RUA</p><h1>Vamos entregar?</h1><p>Você tem {dados.pedidos.length} entrega(s) atribuída(s).</p>
    <div className="delivery-actions"><button disabled={ocupado} className={dados.status !== 'offline' ? 'delivery-secondary' : ''} onClick={() => agir('/entregador/disponibilidade', { disponivel: dados.status === 'offline' }, 'Disponibilidade atualizada.')}>{dados.status === 'offline' ? 'Estou disponível' : 'Ficar offline'}</button></div><p className="delivery-muted">Localização automática ativa: atualiza a cada 30 segundos enquanto este app estiver aberto e visível.</p>
    {(erro || erroLocalizacao) && <p role="alert" className="delivery-error">{erro || erroLocalizacao}</p>}{aviso && <p role="status" className="delivery-success">{aviso}</p>}
    {dados.pedidos.map(pedido => <article className="delivery-card delivery-order" key={pedido._id}><span className="delivery-badge">{pedido.status === 'despachado' ? 'Aguardando retirada' : 'A caminho'}</span><h2>{pedido.origem.nomeCliente}</h2><p><strong>Retirar em {pedido.tenantId?.nome}</strong><br />{pedido.tenantId?.endereco}</p><p><strong>Entregar em</strong><br />{pedido.origem.endereco.rua}, {pedido.origem.endereco.numero}<br />{pedido.origem.endereco.bairro} {pedido.origem.endereco.complemento}</p>{pedido.origem.endereco.referencia && <p>{pedido.origem.endereco.referencia}</p>}<p>Pedido: {Number(pedido.valorTotal).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} · Taxa: {Number(pedido.taxaEntrega).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</p><div className="delivery-actions"><a className="delivery-button delivery-secondary" href={`tel:${pedido.origem.telefone.replace(/[^\d+]/g, '')}`}>Ligar para cliente</a><button disabled={ocupado} onClick={() => { if (pedido.status === 'a_caminho' && !window.confirm('Confirmar que o pedido foi entregue ao cliente?')) return; void agir(`/entregador/pedido/${pedido._id}/status`, { novoStatus: pedido.status === 'despachado' ? 'a_caminho' : 'entregue' }, pedido.status === 'despachado' ? 'Saída registrada. Boa entrega!' : 'Entrega confirmada!'); }}>{pedido.status === 'despachado' ? 'Retirei / saiu para entrega' : 'Confirmar entrega'}</button></div></article>)}
    {!dados.pedidos.length && <div className="delivery-card delivery-empty">Nenhuma entrega atribuída. Fique disponível para receber novos pedidos.</div>}
  </>;
}

export default function DeliveryEntregador() { return <DeliveryPortal courier><PainelEntregador /></DeliveryPortal>; }

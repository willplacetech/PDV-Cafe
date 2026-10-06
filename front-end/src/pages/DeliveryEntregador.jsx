import { useCallback, useEffect, useState } from 'react';
import DeliveryPortal from '../components/DeliveryPortal.jsx';
import { courierApi, erroDelivery } from '../services/deliveryApi.js';

function PainelEntregador() {
  const [dados, setDados] = useState({ pedidos: [], status: 'offline' });
  const [erro, setErro] = useState('');
  const [aviso, setAviso] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const carregar = useCallback(async () => {
    try { const { data } = await courierApi.get('/entregador/pedidos'); setDados(data); setErro(''); }
    catch (error) { setErro(erroDelivery(error)); }
  }, []);
  useEffect(() => { const inicio = setTimeout(() => { void carregar(); }, 0); const timer = setInterval(carregar, 15000); return () => { clearTimeout(inicio); clearInterval(timer); }; }, [carregar]);
  const agir = async (url, body, mensagem) => {
    if (ocupado) return;
    setOcupado(true); setErro('');
    try { await courierApi.post(url, body); setAviso(mensagem); await carregar(); }
    catch (error) { setErro(erroDelivery(error)); }
    finally { setOcupado(false); }
  };
  const posicao = () => {
    if (!navigator.geolocation) { setErro('Este navegador não oferece localização.'); return; }
    navigator.geolocation.getCurrentPosition(position => { void agir('/entregador/posicao', { lat: position.coords.latitude, lng: position.coords.longitude }, 'Posição atualizada.'); }, () => setErro('Não foi possível obter sua posição. Autorize a localização no navegador.'), { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 });
  };
  return <><p className="delivery-eyebrow">SEU DIA NA RUA</p><h1>Vamos entregar?</h1><p>Você tem {dados.pedidos.length} entrega(s) atribuída(s).</p>
    <div className="delivery-actions"><button disabled={ocupado} className={dados.status !== 'offline' ? 'delivery-secondary' : ''} onClick={() => agir('/entregador/disponibilidade', { disponivel: dados.status === 'offline' }, 'Disponibilidade atualizada.')}>{dados.status === 'offline' ? 'Estou disponível' : 'Ficar offline'}</button><button disabled={ocupado} className="delivery-secondary" onClick={posicao}>Atualizar posição</button></div><p className="delivery-muted">A localização é opcional e só aparece para o cliente durante a entrega.</p>
    {erro && <p role="alert" className="delivery-error">{erro}</p>}{aviso && <p role="status" className="delivery-success">{aviso}</p>}
    {dados.pedidos.map(pedido => <article className="delivery-card delivery-order" key={pedido._id}><span className="delivery-badge">{pedido.status === 'despachado' ? 'Aguardando retirada' : 'A caminho'}</span><h2>{pedido.origem.nomeCliente}</h2><p><strong>Retirar em {pedido.tenantId?.nome}</strong><br />{pedido.tenantId?.endereco}</p><p><strong>Entregar em</strong><br />{pedido.origem.endereco.rua}, {pedido.origem.endereco.numero}<br />{pedido.origem.endereco.bairro} {pedido.origem.endereco.complemento}</p>{pedido.origem.endereco.referencia && <p>{pedido.origem.endereco.referencia}</p>}<p>Pedido: {Number(pedido.valorTotal).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} · Taxa: {Number(pedido.taxaEntrega).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</p><div className="delivery-actions"><a className="delivery-button delivery-secondary" href={`tel:${pedido.origem.telefone.replace(/[^\d+]/g, '')}`}>Ligar para cliente</a><button disabled={ocupado} onClick={() => { if (pedido.status === 'a_caminho' && !window.confirm('Confirmar que o pedido foi entregue ao cliente?')) return; void agir(`/entregador/pedido/${pedido._id}/status`, { novoStatus: pedido.status === 'despachado' ? 'a_caminho' : 'entregue' }, pedido.status === 'despachado' ? 'Saída registrada. Boa entrega!' : 'Entrega confirmada!'); }}>{pedido.status === 'despachado' ? 'Retirei / saiu para entrega' : 'Confirmar entrega'}</button></div></article>)}
    {!dados.pedidos.length && <div className="delivery-card delivery-empty">Nenhuma entrega atribuída. Fique disponível para receber novos pedidos.</div>}
  </>;
}

export default function DeliveryEntregador() { return <DeliveryPortal courier><PainelEntregador /></DeliveryPortal>; }

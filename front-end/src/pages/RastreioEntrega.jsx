import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { deliveryApi, erroDelivery } from '../services/deliveryApi.js';
import '../styles/delivery.css';

const etapas = [['pendente', 'Pedido recebido'], ['despachado', 'Despachado'], ['a_caminho', 'A caminho'], ['entregue', 'Entregue']];

export default function RastreioEntrega() {
  const { token } = useParams();
  const [pedido, setPedido] = useState(null);
  const [erro, setErro] = useState('');
  const [conexao, setConexao] = useState('Conectando…');
  useEffect(() => {
    let ativo = true;
    let polling;
    let stream;
    const atualizar = dados => { if (ativo) { setPedido(dados); setErro(''); } };
    const consultar = async () => {
      try { const { data } = await deliveryApi.get(`/rastreio/${encodeURIComponent(token)}`); atualizar(data); return true; }
      catch (error) { if (ativo) setErro(erroDelivery(error)); return false; }
    };
    const iniciar = async () => {
      const carregado = await consultar();
      if (!ativo) return;
      if (!carregado) { setConexao('Atualização automática a cada 15 segundos'); polling = setInterval(consultar, 15000); return; }
      const base = deliveryApi.defaults.baseURL.replace(/\/$/, '');
      stream = new EventSource(`${base}/rastreio/${encodeURIComponent(token)}/stream`);
      stream.onmessage = event => {
        try {
          const dados = JSON.parse(event.data); atualizar(dados);
          setConexao('Atualizado em tempo real'); clearInterval(polling); polling = null;
          if (['entregue', 'cancelado'].includes(dados.status)) { setConexao('Entrega finalizada'); stream.close(); }
        } catch { /* mantém o último estado válido */ }
      };
      stream.onerror = () => {
        if (!ativo) return;
        setConexao('Atualização automática a cada 15 segundos');
        if (!polling) { void consultar(); polling = setInterval(consultar, 15000); }
      };
    };
    void iniciar();
    return () => { ativo = false; stream?.close(); clearInterval(polling); };
  }, [token]);
  const atual = etapas.findIndex(([status]) => status === pedido?.status);
  const posicao = pedido?.posicaoEntregador;
  const mapa = posicao && Number.isFinite(posicao.lat) && Number.isFinite(posicao.lng) ? `https://www.openstreetmap.org/export/embed.html?bbox=${posicao.lng - .01},${posicao.lat - .01},${posicao.lng + .01},${posicao.lat + .01}&layer=mapnik&marker=${posicao.lat},${posicao.lng}` : null;
  return <div className="delivery-app"><header className="delivery-header"><span className="delivery-brand">Delivery<span>Link</span></span><span>Sua entrega, passo a passo</span></header><main className="delivery-main delivery-tracking">
    <p className="delivery-eyebrow">ACOMPANHE SEU PEDIDO</p><h1>{pedido?.nomeComercio || 'Preparando seu rastreio'}</h1>
    {erro && <p role="alert" className="delivery-error">{erro}</p>}
    {!pedido && !erro && <p role="status">Carregando entrega…</p>}
    {pedido && <>
      <p className="delivery-muted" role="status">{conexao}</p>
      {pedido.status === 'cancelado' ? <div className="delivery-card"><h2>Pedido cancelado</h2><p>Entre em contato com o comércio para saber mais.</p></div> : <>
        {pedido.status === 'a_caminho' && <div className="delivery-card"><p className="delivery-eyebrow">ESTÁ CHEGANDO</p><h2>Chega em aproximadamente {pedido.tempoEstimado} min</h2><p>Seu pedido já saiu para entrega.</p></div>}
        <ol className="delivery-timeline">{etapas.map(([status, nome], index) => {
          const evento = pedido.statusHistorico.find(h => h.status === status);
          return <li key={status} className={index === atual ? 'current' : index < atual ? 'done' : ''} aria-current={index === atual ? 'step' : undefined}><strong>{nome}{index < atual ? ' ✓' : ''}</strong>{evento && <time dateTime={evento.data}>{new Date(evento.data).toLocaleString('pt-BR')}</time>}</li>;
        })}</ol>
        {mapa && <iframe title="Posição atual do entregador" src={mapa} loading="lazy" referrerPolicy="no-referrer" />}
      </>}
      <footer className="delivery-tracking-footer"><a className="delivery-button" href={pedido.whatsappComercio} target="_blank" rel="noreferrer">Fazer novo pedido</a></footer>
    </>}
  </main></div>;
}

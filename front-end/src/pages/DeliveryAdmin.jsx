import { useCallback, useEffect, useState } from 'react';
import DeliveryPortal from '../components/DeliveryPortal.jsx';
import { deliveryApi, erroDelivery } from '../services/deliveryApi.js';

const statusNomes = { pendente: 'Pendente', despachado: 'Despachado', a_caminho: 'A caminho', entregue: 'Entregue', cancelado: 'Cancelado' };
const moeda = valor => Number(valor || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

function FormularioPedido({ onCriado, onErro }) {
  const [itens, setItens] = useState([]);
  const [salvando, setSalvando] = useState(false);
  const salvar = async event => {
    event.preventDefault(); setSalvando(true);
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const endereco = Object.fromEntries(['rua', 'numero', 'bairro', 'complemento', 'referencia'].map(c => [c, form.get(c) || '']));
    try {
      await deliveryApi.post('/tenant/pedidos', { origem: { nomeCliente: form.get('nomeCliente'), telefone: form.get('telefone'), endereco }, valorTotal: Number(form.get('valorTotal')), taxaEntrega: Number(form.get('taxaEntrega')), itens: itens.map(i => ({ ...i, quantidade: Number(i.quantidade), precoUnitario: Number(i.precoUnitario) })) });
      formElement.reset(); setItens([]); onCriado();
    } catch (error) { onErro(erroDelivery(error)); }
    finally { setSalvando(false); }
  };
  const alterarItem = (index, campo, valor) => setItens(prev => prev.map((item, i) => i === index ? { ...item, [campo]: valor } : item));
  return <form className="delivery-card" onSubmit={salvar}><h2>Novo pedido de entrega</h2><div className="delivery-form-grid">
    <label>Nome do cliente<input name="nomeCliente" required maxLength={160} /></label><label>Telefone do cliente<input name="telefone" type="tel" required maxLength={30} /></label>
    <label>Rua<input name="rua" required maxLength={200} /></label><label>Número<input name="numero" required maxLength={30} /></label><label>Bairro<input name="bairro" required maxLength={120} /></label><label>Complemento<input name="complemento" maxLength={200} /></label><label>Referência<input name="referencia" maxLength={300} /></label>
    <label>Valor do pedido (R$)<input name="valorTotal" type="number" step="0.01" min="0" required /></label><label>Taxa de entrega (R$)<input name="taxaEntrega" type="number" step="0.01" min="0" defaultValue="0" required /></label>
  </div><details><summary>Itens do pedido (opcional)</summary>{itens.map((item, index) => <div className="delivery-form-grid" key={index}>
    <label>Descrição<input value={item.descricao} onChange={e => alterarItem(index, 'descricao', e.target.value)} required /></label><label>Quantidade<input type="number" min="0.001" step="0.001" value={item.quantidade} onChange={e => alterarItem(index, 'quantidade', e.target.value)} required /></label><label>Preço unitário<input type="number" min="0" step="0.01" value={item.precoUnitario} onChange={e => alterarItem(index, 'precoUnitario', e.target.value)} required /></label><button type="button" className="delivery-danger" onClick={() => setItens(prev => prev.filter((_, i) => i !== index))}>Remover item</button>
  </div>)}<button type="button" className="delivery-secondary" onClick={() => setItens(prev => [...prev, { descricao: '', quantidade: '1', precoUnitario: '0' }])}>Adicionar item</button></details><div className="delivery-actions"><button disabled={salvando}>{salvando ? 'Salvando…' : 'Criar pedido'}</button></div></form>;
}

function PainelComercio() {
  const [aba, setAba] = useState('fila');
  const [pedidos, setPedidos] = useState([]);
  const [agora, setAgora] = useState(Date.now);
  const [entregadores, setEntregadores] = useState([]);
  const [stats, setStats] = useState({});
  const [tenant, setTenant] = useState(null);
  const [erro, setErro] = useState('');
  const [aviso, setAviso] = useState('');
  const [whatsapp, setWhatsapp] = useState(null);
  const [selecao, setSelecao] = useState({});
  const [ocupado, setOcupado] = useState(false);
  const [status, setStatus] = useState('');
  const [data, setData] = useState('');
  const [pagina, setPagina] = useState(1);
  const [paginas, setPaginas] = useState(0);
  const carregar = useCallback(async () => {
    try {
      const query = new URLSearchParams({ pagina: String(aba === 'fila' ? 1 : pagina), limite: '30' });
      if (aba === 'fila') query.set('status', 'pendente');
      else { if (status) query.set('status', status); if (data) query.set('data', data); }
      const resultados = await Promise.all([deliveryApi.get(`/tenant/pedidos?${query}`), deliveryApi.get('/tenant/entregadores'), deliveryApi.get('/tenant/estatisticas'), deliveryApi.get('/tenant/configuracao')]);
      setAgora(Date.now()); setPedidos(resultados[0].data.pedidos); setPaginas(resultados[0].data.paginas);
      setEntregadores(resultados[1].data); setStats(resultados[2].data); setTenant(resultados[3].data);
      setErro('');
    } catch (error) { setErro(erroDelivery(error)); }
  }, [aba, pagina, status, data]);
  useEffect(() => { const inicio = setTimeout(() => { void carregar(); }, 0); const timer = setInterval(carregar, 15000); return () => { clearTimeout(inicio); clearInterval(timer); }; }, [carregar]);
  const agir = async fn => {
    if (ocupado) return;
    setOcupado(true); setErro(''); setAviso('');
    try { await fn(); await carregar(); }
    catch (error) { setErro(erroDelivery(error)); }
    finally { setOcupado(false); }
  };
  const despachar = pedido => agir(async () => {
    const { data } = await deliveryApi.post(`/tenant/pedidos/${pedido._id}/despachar`, { entregadorId: selecao[pedido._id] });
    setWhatsapp(data.whatsapp); setAviso('Pedido despachado. O entregador verá a entrega no aplicativo.');
  });
  const cancelar = pedido => {
    const motivo = window.prompt('Qual o motivo do cancelamento?');
    if (motivo?.trim()) void agir(async () => { await deliveryApi.post(`/tenant/pedidos/${pedido._id}/cancelar`, { motivo }); setAviso('Pedido cancelado.'); });
  };
  const salvarEntregador = event => {
    event.preventDefault(); const formElement = event.currentTarget; const form = new FormData(formElement);
    void agir(async () => { await deliveryApi.post('/tenant/entregadores', Object.fromEntries(form)); formElement.reset(); setAviso('Entregador cadastrado. Compartilhe a senha temporária com ele.'); });
  };
  const configurar = event => {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    void agir(async () => { await deliveryApi.put('/tenant/configuracao', { tempoEstimadoPadraoMin: Number(form.get('tempo')), mensagemWhatsApp: form.get('mensagem') }); setAviso('Configurações salvas.'); });
  };
  return <>
    <p className="delivery-eyebrow">OPERAÇÃO DO DIA</p><h1>{tenant?.nome || 'Suas entregas'}</h1><p className="delivery-muted">Do pedido recebido à entrega confirmada.</p>
    <div className="delivery-stats">{[['Pedidos hoje', stats.totalHoje || 0], ['Entregues', stats.entregues || 0], ['Tempo médio', `${stats.tempoMedioMin || 0} min`], ['Cancelados', stats.cancelados || 0]].map(([label, value]) => <div className="delivery-card delivery-stat" key={label}><span>{label}</span><strong>{value}</strong></div>)}</div>
    <div className="delivery-tabs" role="tablist" aria-label="Gestão de entregas">{[['fila', 'Fila de pedidos'], ['novo', 'Novo pedido'], ['historico', 'Histórico'], ['entregadores', 'Entregadores'], ['configuracao', 'Configurações']].map(([id, label]) => <button key={id} role="tab" aria-selected={aba === id} onClick={() => { setAba(id); setPagina(1); }}>{label}</button>)}</div>
    {erro && <p role="alert" className="delivery-error">{erro}</p>}{aviso && <p role="status" className="delivery-success">{aviso}</p>}
    {whatsapp && <div className="delivery-card"><h2>Link para o cliente</h2><p className="delivery-muted">Você pode abrir o WhatsApp ou copiar a mensagem.</p><textarea aria-label="Mensagem de rastreamento" readOnly value={whatsapp.mensagemPronta} /><div className="delivery-actions"><a className="delivery-button" href={whatsapp.whatsappUrl} target="_blank" rel="noreferrer">Abrir WhatsApp</a><button className="delivery-secondary" onClick={async () => { try { await navigator.clipboard.writeText(whatsapp.mensagemPronta); setAviso('Mensagem copiada.'); } catch { setAviso('Selecione a mensagem acima para copiar.'); } }}>Copiar mensagem</button><button className="delivery-secondary" onClick={() => setWhatsapp(null)}>Fechar</button></div></div>}
    {aba === 'novo' && <FormularioPedido onErro={setErro} onCriado={() => { setAviso('Pedido criado.'); setAba('fila'); void carregar(); }} />}
    {aba === 'historico' && <div className="delivery-form-grid"><label>Status<select value={status} onChange={e => { setStatus(e.target.value); setPagina(1); }}><option value="">Todos</option>{Object.entries(statusNomes).map(([id, nome]) => <option key={id} value={id}>{nome}</option>)}</select></label><label>Data<input type="date" value={data} onChange={e => { setData(e.target.value); setPagina(1); }} /></label></div>}
    {['fila', 'historico'].includes(aba) && <><div className="delivery-grid">{pedidos.map(pedido => {
      const minutos = Math.max(0, Math.floor((agora - new Date(pedido.criadoEm)) / 60000));
      const endereco = pedido.origem.endereco;
      return <article className={`delivery-card delivery-order ${minutos >= 20 ? 'vermelho' : minutos >= 10 ? 'amarelo' : ''}`} key={pedido._id}><span className="delivery-badge">{statusNomes[pedido.status]}</span><p className="delivery-muted">Há {minutos} min · {new Date(pedido.criadoEm).toLocaleString('pt-BR')}</p><h3>{pedido.origem.nomeCliente}</h3><p>{endereco.rua}, {endereco.numero} · {endereco.bairro}{endereco.complemento && ` · ${endereco.complemento}`}</p>{endereco.referencia && <p className="delivery-muted">{endereco.referencia}</p>}<p><strong>{moeda(pedido.valorTotal)}</strong> + {moeda(pedido.taxaEntrega)} de entrega</p>{pedido.entregadorId && <p className="delivery-muted">Entregador: {pedido.entregadorId.nome}</p>}
        {pedido.status === 'pendente' && <><label>Entregador<select value={selecao[pedido._id] || ''} onChange={e => setSelecao(prev => ({ ...prev, [pedido._id]: e.target.value }))}><option value="">Selecione um entregador</option>{entregadores.filter(e => e.status !== 'offline').map(e => <option value={e._id} key={e._id}>{e.nome} · {e.status === 'em_entrega' ? 'Em entrega' : 'Disponível'}</option>)}</select></label><button disabled={ocupado || !selecao[pedido._id]} onClick={() => despachar(pedido)}>Despachar</button></>}
        <div className="delivery-actions"><a href={`/pedido/${pedido.tokenRastreamento}`} target="_blank" rel="noreferrer">Ver rastreio</a><button className="delivery-secondary" disabled={ocupado} onClick={() => agir(async () => { const { data } = await deliveryApi.post(`/tenant/pedidos/${pedido._id}/enviar-whatsapp`, {}); setWhatsapp(data); setAviso(data.enviado ? 'Mensagem enviada.' : 'Mensagem pronta para compartilhar.'); })}>WhatsApp</button>{!['entregue', 'cancelado'].includes(pedido.status) && <button className="delivery-danger" disabled={ocupado} onClick={() => cancelar(pedido)}>Cancelar</button>}</div>
      </article>;
    })}</div>{!pedidos.length && <div className="delivery-card delivery-empty">Nenhum pedido por aqui.</div>}{aba === 'historico' && <div className="delivery-actions"><button disabled={pagina <= 1} onClick={() => setPagina(p => p - 1)}>Anterior</button><span>Página {pagina} de {Math.max(1, paginas)}</span><button disabled={pagina >= paginas} onClick={() => setPagina(p => p + 1)}>Próxima</button></div>}</>}
    {aba === 'entregadores' && <div className="delivery-grid"><form className="delivery-card" onSubmit={salvarEntregador}><h2>Cadastrar entregador</h2><label>Nome<input name="nome" required /></label><label>Telefone<input name="telefone" type="tel" required /></label><label>Senha temporária<input name="senha" type="password" minLength={8} maxLength={72} required autoComplete="new-password" /></label><button disabled={ocupado}>Cadastrar entregador</button></form><div className="delivery-card"><h2>Sua equipe</h2>{entregadores.map(e => <p key={e._id}><strong>{e.nome}</strong><br />{e.telefone} · {e.status === 'offline' ? 'Offline' : e.status === 'em_entrega' ? 'Em entrega' : 'Disponível'}{!e.tenantId && ' · Entregador livre'}</p>)}{!entregadores.length && <p>Nenhum entregador cadastrado.</p>}</div></div>}
    {aba === 'configuracao' && tenant && <form className="delivery-card" onSubmit={configurar} key={tenant._id}><h2>Configurações de entrega</h2><label>Tempo estimado padrão (minutos)<input name="tempo" type="number" min="1" step="1" required defaultValue={tenant.configuracao.tempoEstimadoPadraoMin} /></label><label>Mensagem para o cliente<textarea name="mensagem" required maxLength={1000} defaultValue={tenant.configuracao.mensagemWhatsApp} /></label><p className="delivery-muted">Use {'{link}'} no ponto onde deve aparecer o rastreamento.</p><button disabled={ocupado}>Salvar configurações</button></form>}
  </>;
}

export default function DeliveryAdmin() { return <DeliveryPortal><PainelComercio /></DeliveryPortal>; }

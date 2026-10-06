import { useCallback, useEffect, useState } from 'react';
import DeliveryPortal from '../components/DeliveryPortal.jsx';
import { deliveryApi, erroDelivery } from '../services/deliveryApi.js';

function PainelPlataforma() {
  const [tenants, setTenants] = useState([]);
  const [edicao, setEdicao] = useState(null);
  const [erro, setErro] = useState('');
  const [aviso, setAviso] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const carregar = useCallback(async () => {
    try { const { data } = await deliveryApi.get('/plataforma/tenants'); setTenants(data); }
    catch (error) { setErro(erroDelivery(error)); }
  }, []);
  useEffect(() => { const timer = setTimeout(() => { void carregar(); }, 0); return () => clearTimeout(timer); }, [carregar]);
  const agir = async fn => {
    if (ocupado) return;
    setOcupado(true); setErro(''); setAviso('');
    try { await fn(); await carregar(); }
    catch (error) { setErro(erroDelivery(error)); }
    finally { setOcupado(false); }
  };
  const salvar = event => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const body = Object.fromEntries(form);
    body.taxaPorEntrega = Number(body.taxaPorEntrega || 0);
    body.ativo = body.ativo === 'true';
    if (!body.dataVencimento) delete body.dataVencimento;
    void agir(async () => {
      if (edicao) await deliveryApi.put(`/plataforma/tenants/${edicao._id}`, body);
      else await deliveryApi.post('/plataforma/tenants', body);
      setEdicao(null); setAviso('Comércio salvo.');
    });
  };
  return <><p className="delivery-eyebrow">VISÃO DA PLATAFORMA</p><h1>Comércios conectados</h1><p className="delivery-muted">Gerencie acesso, planos e vencimentos em um só lugar.</p>
    {erro && <p role="alert" className="delivery-error">{erro}</p>}{aviso && <p role="status" className="delivery-success">{aviso}</p>}
    <form className="delivery-card" onSubmit={salvar} key={edicao?._id || 'novo'}><h2>{edicao ? `Editar ${edicao.nome}` : 'Cadastrar comércio'}</h2><div className="delivery-form-grid">
      <label>Nome<input name="nome" required defaultValue={edicao?.nome} /></label><label>Slug do comércio<input name="slug" pattern="[a-z0-9]+(-[a-z0-9]+)*" required defaultValue={edicao?.slug} placeholder="cafe-da-praca" /></label><label>CNPJ (opcional)<input name="cnpj" defaultValue={edicao?.cnpj} /></label><label>Telefone<input name="telefone" type="tel" required defaultValue={edicao?.telefone} /></label><label>Endereço<input name="endereco" required defaultValue={edicao?.endereco} /></label><label>Plano<select name="plano" defaultValue={edicao?.plano || 'teste'}><option value="teste">Teste</option><option value="mensal">Mensal</option></select></label><label>Vencimento<input name="dataVencimento" type="date" defaultValue={edicao?.dataVencimento?.slice(0, 10)} /></label><label>Taxa por entrega (R$)<input name="taxaPorEntrega" type="number" step="0.01" min="0" defaultValue={edicao?.taxaPorEntrega || 0} /></label><label>Acesso<select name="ativo" defaultValue={edicao?.ativo === false ? 'false' : 'true'}><option value="true">Ativo</option><option value="false">Desativado</option></select></label>
      {!edicao && <><label>E-mail do administrador<input name="adminEmail" type="email" required /></label><label>Senha inicial<input name="adminSenha" type="password" minLength={8} maxLength={72} autoComplete="new-password" required /></label></>}
    </div><div className="delivery-actions"><button disabled={ocupado}>{edicao ? 'Salvar alterações' : 'Criar comércio'}</button>{edicao && <button type="button" className="delivery-secondary" onClick={() => setEdicao(null)}>Cancelar edição</button>}</div></form>
    <div className="delivery-grid" style={{ marginTop: 24 }}>{tenants.map(tenant => <article className="delivery-card" key={tenant._id}><h2>{tenant.nome}</h2><span className="delivery-badge">{tenant.ativo ? 'Ativo' : 'Desativado'} · {tenant.plano}</span><p>{tenant.slug}<br />Vencimento: {tenant.dataVencimento ? new Date(tenant.dataVencimento).toLocaleDateString('pt-BR', { timeZone: 'UTC' }) : 'Não definido'}</p><div className="delivery-actions"><button className="delivery-secondary" onClick={() => setEdicao(tenant)}>Editar</button><button className="delivery-danger" disabled={ocupado || !tenant.ativo} onClick={() => { if (window.confirm(`Desativar o acesso de ${tenant.nome}?`)) void agir(async () => { await deliveryApi.delete(`/plataforma/tenants/${tenant._id}`); setAviso('Comércio desativado. Histórico preservado.'); }); }}>Desativar</button></div><details><summary>Associar usuário do PDV</summary><form onSubmit={event => { event.preventDefault(); const form = new FormData(event.currentTarget); void agir(async () => { await deliveryApi.post(`/plataforma/tenants/${tenant._id}/vincular-pdv`, { username: form.get('username') }); setAviso('Usuário associado. Entre novamente no PDV para atualizar o vínculo.'); }); }}><label>Usuário já cadastrado no PDV<input name="username" required /></label><button disabled={ocupado}>Associar ao comércio</button></form></details></article>)}</div>
    <details className="delivery-card" style={{ marginTop: 24 }}><summary>Cadastrar entregador livre (vários comércios)</summary><form onSubmit={event => { event.preventDefault(); const formElement = event.currentTarget; const body = Object.fromEntries(new FormData(formElement)); void agir(async () => { await deliveryApi.post('/plataforma/entregadores', body); formElement.reset(); setAviso('Entregador livre cadastrado.'); }); }}><div className="delivery-form-grid"><label>Nome<input name="nome" required /></label><label>Telefone<input name="telefone" type="tel" required /></label><label>Senha temporária<input name="senha" type="password" minLength={8} maxLength={72} required /></label></div><button disabled={ocupado}>Cadastrar entregador livre</button></form></details>
  </>;
}

export default function DeliveryPlataforma() { return <DeliveryPortal plataforma><PainelPlataforma /></DeliveryPortal>; }

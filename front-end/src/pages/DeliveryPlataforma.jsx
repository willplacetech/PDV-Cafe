import { useCallback, useEffect, useState } from 'react';
import DeliveryPortal from '../components/DeliveryPortal.jsx';
import { deliveryApi, erroDelivery } from '../services/deliveryApi.js';

function PainelPlataforma() {
  const [tenants, setTenants] = useState([]);
  const [entregadores, setEntregadores] = useState([]);
  const [edicao, setEdicao] = useState(null);
  const [edicaoEntregador, setEdicaoEntregador] = useState(null);
  const [erro, setErro] = useState('');
  const [aviso, setAviso] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const carregar = useCallback(async () => {
    try {
      const [empresas, equipe] = await Promise.all([
        deliveryApi.get('/plataforma/tenants'),
        deliveryApi.get('/plataforma/entregadores'),
      ]);
      setTenants(empresas.data);
      setEntregadores(equipe.data);
    }
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
  const salvarEntregador = event => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const body = Object.fromEntries(form);
    if (!body.senha) delete body.senha;
    void agir(async () => {
      if (edicaoEntregador) await deliveryApi.put(`/plataforma/entregadores/${edicaoEntregador._id}`, body);
      else await deliveryApi.post('/plataforma/entregadores', body);
      setEdicaoEntregador(null);
      setAviso('Entregador salvo.');
    });
  };
  return <><p className="delivery-eyebrow">VISÃO DA PLATAFORMA</p><h1>Comércios conectados</h1><p className="delivery-muted">Gerencie acesso, planos e vencimentos em um só lugar.</p>
    {erro && <p role="alert" className="delivery-error">{erro}</p>}{aviso && <p role="status" className="delivery-success">{aviso}</p>}
    <form className="delivery-card" onSubmit={salvar} key={edicao?._id || 'novo'}><h2>{edicao ? `Editar ${edicao.nome}` : 'Cadastrar comércio'}</h2><div className="delivery-form-grid">
      <label>Nome<input name="nome" required defaultValue={edicao?.nome} /></label><label>Slug do comércio<input name="slug" pattern="[a-z0-9]+(-[a-z0-9]+)*" required defaultValue={edicao?.slug} placeholder="cafe-da-praca" /></label><label>CNPJ (opcional)<input name="cnpj" defaultValue={edicao?.cnpj} /></label><label>Telefone<input name="telefone" type="tel" required defaultValue={edicao?.telefone} /></label><label>Endereço<input name="endereco" required defaultValue={edicao?.endereco} /></label><label>Plano<select name="plano" defaultValue={edicao?.plano || 'teste'}><option value="teste">Teste</option><option value="mensal">Mensal</option></select></label><label>Vencimento<input name="dataVencimento" type="date" defaultValue={edicao?.dataVencimento?.slice(0, 10)} /></label><label>Taxa por entrega (R$)<input name="taxaPorEntrega" type="number" step="0.01" min="0" defaultValue={edicao?.taxaPorEntrega || 0} /></label><label>Acesso<select name="ativo" defaultValue={edicao?.ativo === false ? 'false' : 'true'}><option value="true">Ativo</option><option value="false">Desativado</option></select></label>
      <label>E-mail do administrador<input name="adminEmail" type="email" required defaultValue={edicao?.adminEmail || ''} /></label>
      <label>{edicao ? 'Nova senha do administrador (opcional)' : 'Senha inicial do administrador'}<input name="adminSenha" type="password" minLength={12} maxLength={72} autoComplete="new-password" aria-describedby="senha-inicial-ajuda" required={!edicao || !edicao.adminEmail} /><span id="senha-inicial-ajuda" className="delivery-muted">{edicao ? 'Deixe em branco para manter a senha atual. Se a empresa ainda não tiver administrador, informe uma senha com pelo menos 12 caracteres.' : 'Obrigatória ao cadastrar a loja: pelo menos 12 caracteres. Será usada no acesso do comércio.'}</span></label>
    </div><div className="delivery-actions"><button disabled={ocupado}>{edicao ? 'Salvar alterações' : 'Criar comércio'}</button>{edicao && <button type="button" className="delivery-secondary" onClick={() => setEdicao(null)}>Cancelar edição</button>}</div></form>
    <div className="delivery-grid" style={{ marginTop: 24 }}>{tenants.map(tenant => <article className="delivery-card" key={tenant._id}><h2>{tenant.nome}</h2><span className="delivery-badge">{tenant.ativo ? 'Ativo' : 'Desativado'} · {tenant.plano}{tenant.pdvIntegrado ? ' · PDV integrado' : ''}</span><p>{tenant.slug}<br />Vencimento: {tenant.dataVencimento ? new Date(tenant.dataVencimento).toLocaleDateString('pt-BR', { timeZone: 'UTC' }) : 'Não definido'}</p><div className="delivery-actions"><button className="delivery-secondary" onClick={() => setEdicao(tenant)}>Editar</button><button className="delivery-danger" disabled={ocupado} onClick={() => { if (window.confirm(`Excluir permanentemente ${tenant.nome} e os cadastros Delivery vinculados? Esta ação não pode ser desfeita.`)) void agir(async () => { await deliveryApi.delete(`/plataforma/tenants/${tenant._id}`); if (edicao?._id === tenant._id) setEdicao(null); setAviso('Empresa excluída.'); }); }}>Excluir</button></div><button className="delivery-secondary" disabled={ocupado || !tenant.ativo || tenant.pdvIntegrado} onClick={() => { if (window.confirm(`Definir ${tenant.nome} como o comércio do PDV e associar todos os usuários existentes com perfil admin ou operador? Isso substitui qualquer vínculo atual desses perfis.`)) void agir(async () => { const { data } = await deliveryApi.post(`/plataforma/tenants/${tenant._id}/vincular-pdv`, {}); setAviso(`${data.usuariosVinculados} usuário(s) admin/operador associado(s). Peça que saiam e entrem novamente no PDV para atualizar a sessão.`); }); }}>{tenant.pdvIntegrado ? 'Comércio do PDV' : 'Usar como comércio do PDV'}</button></article>)}</div>
    <section className="delivery-grid" style={{ marginTop: 24 }}>
      <form className="delivery-card" onSubmit={salvarEntregador} key={edicaoEntregador?._id || 'novo-entregador'}>
        <h2>{edicaoEntregador ? `Editar ${edicaoEntregador.nome}` : 'Cadastrar entregador livre'}</h2>
        <p className="delivery-muted">Entregadores livres podem receber pedidos de diferentes comércios.</p>
        <div className="delivery-form-grid">
          <label>Nome<input name="nome" required defaultValue={edicaoEntregador?.nome} /></label>
          <label>Telefone<input name="telefone" type="tel" required defaultValue={edicaoEntregador?.telefone} /></label>
          <label>{edicaoEntregador ? 'Nova senha (opcional)' : 'Senha temporária'}<input name="senha" type="password" minLength={12} maxLength={72} required={!edicaoEntregador} autoComplete="new-password" /></label>
        </div>
        <div className="delivery-actions"><button disabled={ocupado}>{edicaoEntregador ? 'Salvar entregador' : 'Cadastrar entregador'}</button>{edicaoEntregador && <button type="button" className="delivery-secondary" onClick={() => setEdicaoEntregador(null)}>Cancelar edição</button>}</div>
      </form>
      <div className="delivery-card">
        <h2>Entregadores cadastrados</h2>
        {entregadores.map(entregador => <article key={entregador._id} style={{ borderTop: '1px solid #dce4dc', padding: '12px 0' }}>
          <strong>{entregador.nome}</strong><p className="delivery-muted">{entregador.telefone} · {entregador.tenantId?.nome || 'Livre'} · {entregador.ativo === false ? 'Desativado' : entregador.status === 'offline' ? 'Offline' : entregador.status === 'em_entrega' ? 'Em entrega' : 'Disponível'}</p>
          <div className="delivery-actions"><button type="button" className="delivery-secondary" onClick={() => setEdicaoEntregador(entregador)}>Editar</button><button type="button" className="delivery-secondary" disabled={ocupado} onClick={() => void agir(async () => { await deliveryApi.put(`/plataforma/entregadores/${entregador._id}`, { ativo: entregador.ativo === false }); setAviso(entregador.ativo === false ? 'Entregador ativado.' : 'Entregador desativado.'); })}>{entregador.ativo === false ? 'Ativar' : 'Desativar'}</button><button type="button" className="delivery-danger" disabled={ocupado} onClick={() => { if (window.confirm(`Excluir permanentemente ${entregador.nome}?`)) void agir(async () => { await deliveryApi.delete(`/plataforma/entregadores/${entregador._id}`); if (edicaoEntregador?._id === entregador._id) setEdicaoEntregador(null); setAviso('Entregador excluído.'); }); }}>Excluir</button></div>
        </article>)}
        {!entregadores.length && <p>Nenhum entregador cadastrado.</p>}
      </div>
    </section>
  </>;
}

export default function DeliveryPlataforma() { return <DeliveryPortal plataforma><PainelPlataforma /></DeliveryPortal>; }

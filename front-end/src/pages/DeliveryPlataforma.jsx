import FieldLabel from '../components/FieldLabel.jsx';
import SearchableSelect from '../components/SearchableSelect.jsx';
import { useCallback, useEffect, useState } from 'react';
import DeliveryPortal from '../components/DeliveryPortal.jsx';
import { deliveryApi, erroDelivery } from '../services/deliveryApi.js';
import Paginacao from '../components/Paginacao.jsx';
import usePagination from '../hooks/usePagination.js';
import ConfirmarAcao from '../components/ConfirmarAcao.jsx';
import EstadoLista from '../components/EstadoLista.jsx';
import { useToast } from '../components/useToast.js';
import { parseNumericValue } from '../utils/numeric.js';

function PainelPlataforma() {
  const { showToast } = useToast();
  const [tenants, setTenants] = useState([]);
  const [entregadores, setEntregadores] = useState([]);
  const [edicao, setEdicao] = useState(null);
  const [edicaoEntregador, setEdicaoEntregador] = useState(null);
  const [erro, setErro] = useState('');
  const [erroTenants, setErroTenants] = useState('');
  const [erroEntregadores, setErroEntregadores] = useState('');
  const [aviso, setAviso] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [carregandoTenants, setCarregandoTenants] = useState(true);
  const [carregandoEntregadores, setCarregandoEntregadores] = useState(true);
  const paginacaoTenants = usePagination(tenants);
  const paginacaoEntregadores = usePagination(entregadores);
  const carregarTenants = useCallback(async () => {
    setCarregandoTenants(true);
    try {
      const empresas = await deliveryApi.get('/plataforma/tenants');
      setTenants(empresas.data);
      setErroTenants('');
    }
    catch (error) { setErroTenants(erroDelivery(error)); }
    finally { setCarregandoTenants(false); }
  }, []);
  const carregarEntregadores = useCallback(async () => {
    setCarregandoEntregadores(true);
    try {
      const equipe = await deliveryApi.get('/plataforma/entregadores');
      setEntregadores(equipe.data);
      setErroEntregadores('');
    }
    catch (error) { setErroEntregadores(erroDelivery(error)); }
    finally { setCarregandoEntregadores(false); }
  }, []);
  const carregar = useCallback(async () => {
    await Promise.all([carregarTenants(), carregarEntregadores()]);
  }, [carregarEntregadores, carregarTenants]);
  useEffect(() => { const timer = setTimeout(() => { void carregar(); }, 0); return () => clearTimeout(timer); }, [carregar]);
  const agir = async (fn, mensagemSucesso) => {
    if (ocupado) return;
    setOcupado(true); setErro(''); setAviso('');
    try {
      const resultado = await fn();
      const mensagem = typeof mensagemSucesso === 'function' ? mensagemSucesso(resultado) : mensagemSucesso;
      if (mensagem) showToast(mensagem, 'success');
      await carregar();
    }
    catch (error) {
      const mensagem = erroDelivery(error);
      setErro(mensagem);
      showToast(mensagem, 'error');
    }
    finally { setOcupado(false); }
  };
  const salvar = event => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const body = Object.fromEntries(form);
    body.taxaPorEntrega = parseNumericValue(body.taxaPorEntrega || 0, Number.NaN);
    if (!Number.isFinite(body.taxaPorEntrega) || body.taxaPorEntrega < 0) return showToast('Informe uma taxa por entrega válida.', 'warning');
    body.ativo = body.ativo === 'true';
    if (!body.dataVencimento) delete body.dataVencimento;
    const mensagemSucesso = edicao ? 'Comércio atualizado.' : 'Comércio cadastrado.';
    void agir(async () => {
      if (edicao) await deliveryApi.put(`/plataforma/tenants/${edicao._id}`, body);
      else await deliveryApi.post('/plataforma/tenants', body);
      setEdicao(null); setAviso('Comércio salvo.');
    }, mensagemSucesso);
  };
  const salvarEntregador = event => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const body = Object.fromEntries(form);
    if (!body.senha) delete body.senha;
    const mensagemSucesso = edicaoEntregador ? 'Entregador atualizado.' : 'Entregador cadastrado.';
    void agir(async () => {
      if (edicaoEntregador) await deliveryApi.put(`/plataforma/entregadores/${edicaoEntregador._id}`, body);
      else await deliveryApi.post('/plataforma/entregadores', body);
      setEdicaoEntregador(null);
      setAviso('Entregador salvo.');
    }, mensagemSucesso);
  };
  return <><p className="delivery-eyebrow">VISÃO DA PLATAFORMA</p><h1>Comércios conectados</h1><p className="delivery-muted">Gerencie acesso, planos e vencimentos em um só lugar.</p>
    {erro && <p role="alert" className="delivery-error">{erro}</p>}{aviso && <p role="status" className="delivery-success">{aviso}</p>}
    <form className="delivery-card" onSubmit={salvar} key={edicao?._id || 'novo'}><h2>{edicao ? `Editar ${edicao.nome}` : 'Cadastrar comércio'}</h2><div className="delivery-form-grid">
      <label>Nome<input name="nome" required defaultValue={edicao?.nome} /></label><label>Slug do comércio<input name="slug" pattern="[a-z0-9]+(-[a-z0-9]+)*" required defaultValue={edicao?.slug} placeholder="cafe-da-praca" /></label><label><FieldLabel hint={<> (opcional) </>}> CNPJ </FieldLabel><input name="cnpj" defaultValue={edicao?.cnpj} /></label><label>Telefone<input name="telefone" type="tel" required defaultValue={edicao?.telefone} /></label><label>Endereço<input name="endereco" required defaultValue={edicao?.endereco} /></label><label>Plano<SearchableSelect name="plano" defaultValue={edicao?.plano || 'teste'}><option value="teste">Teste</option><option value="mensal">Mensal</option></SearchableSelect></label><label>Vencimento<input name="dataVencimento" type="date" defaultValue={edicao?.dataVencimento?.slice(0, 10)} /></label><label>Taxa por entrega (R$)<input name="taxaPorEntrega" type="number" step="0.01" min="0" defaultValue={edicao?.taxaPorEntrega || 0} /></label><label>Acesso<SearchableSelect name="ativo" defaultValue={edicao?.ativo === false ? 'false' : 'true'}><option value="true">Ativo</option><option value="false">Desativado</option></SearchableSelect></label>
      <label>E-mail do administrador<input name="adminEmail" type="email" required defaultValue={edicao?.adminEmail || ''} /></label>
      <label><FieldLabel hintId="senha-inicial-ajuda" hint={<> {edicao ? 'Deixe em branco para manter a senha atual. Se a empresa ainda não tiver administrador, informe uma senha com pelo menos 12 caracteres.' : 'Obrigatória ao cadastrar a loja: pelo menos 12 caracteres. Será usada no acesso do comércio.'} </>}> {edicao ? 'Nova senha do administrador' : 'Senha inicial do administrador'} </FieldLabel><input name="adminSenha" type="password" minLength={12} maxLength={72} autoComplete="new-password" aria-describedby="senha-inicial-ajuda" required={!edicao || !edicao.adminEmail} /></label>
    </div><div className="delivery-actions"><button disabled={ocupado}>{edicao ? 'Salvar alterações' : 'Criar comércio'}</button>{edicao && <button type="button" className="delivery-secondary" onClick={() => setEdicao(null)}>Cancelar edição</button>}</div></form>
    <EstadoLista carregando={carregandoTenants} erro={erroTenants} vazio={!tenants.length} onRetry={() => void carregarTenants()} tituloVazio="Nenhum comércio cadastrado." mensagemVazia="Cadastre um comércio usando o formulário acima.">
      <div className="delivery-grid" style={{ marginTop: 24 }}>{paginacaoTenants.itensPagina.map(tenant => <article className="delivery-card" key={tenant._id}><h2>{tenant.nome}</h2><span className="delivery-badge">{tenant.ativo ? 'Ativo' : 'Desativado'} · {tenant.plano}{tenant.pdvIntegrado ? ' · PDV integrado' : ''}</span><p>{tenant.slug}<br />Vencimento: {tenant.dataVencimento ? new Date(tenant.dataVencimento).toLocaleDateString('pt-BR', { timeZone: 'UTC' }) : 'Não definido'}</p><div className="delivery-actions"><button className="delivery-secondary" onClick={() => setEdicao(tenant)}>Editar</button><ConfirmarAcao titulo="Excluir comércio" mensagem={`Excluir permanentemente ${tenant.nome} e os cadastros Delivery vinculados? Esta ação não pode ser desfeita.`} acaoTexto="Excluir comércio" onConfirmar={() => void agir(async () => { await deliveryApi.delete(`/plataforma/tenants/${tenant._id}`); if (edicao?._id === tenant._id) setEdicao(null); setAviso('Empresa excluída.'); }, 'Empresa e cadastros Delivery excluídos.')}>{({ onClick }) => <button className="delivery-danger" disabled={ocupado} onClick={onClick}>Excluir</button>}</ConfirmarAcao></div><ConfirmarAcao titulo="Associar comércio ao PDV" mensagem={`Definir ${tenant.nome} como o comércio do PDV e associar todos os usuários existentes com perfil admin ou operador? Isso substitui qualquer vínculo atual desses perfis.`} acaoTexto="Associar ao PDV" onConfirmar={() => void agir(async () => { const { data } = await deliveryApi.post(`/plataforma/tenants/${tenant._id}/vincular-pdv`, {}); setAviso(`${data.usuariosVinculados} usuário(s) admin/operador associado(s). Peça que saiam e entrem novamente no PDV para atualizar a sessão.`); return `${data.usuariosVinculados} usuário(s) associado(s) ao comércio do PDV.`; }, resultado => resultado)}>{({ onClick }) => <button className="delivery-secondary" disabled={ocupado || !tenant.ativo || tenant.pdvIntegrado} onClick={onClick}>{tenant.pdvIntegrado ? 'Comércio do PDV' : 'Usar como comércio do PDV'}</button>}</ConfirmarAcao></article>)}</div>
    </EstadoLista>
    <Paginacao prefixo="comercios" total={paginacaoTenants.total} paginaAtual={paginacaoTenants.paginaAtual} limiteAtual={paginacaoTenants.limiteAtual} onChangePagina={paginacaoTenants.alterarPagina} onChangeLimite={paginacaoTenants.alterarLimite} />
    <section className="delivery-grid" style={{ marginTop: 24 }}>
      <form className="delivery-card" onSubmit={salvarEntregador} key={edicaoEntregador?._id || 'novo-entregador'}>
        <h2>{edicaoEntregador ? `Editar ${edicaoEntregador.nome}` : 'Cadastrar entregador livre'}</h2>
        <p className="delivery-muted">Entregadores livres podem receber pedidos de diferentes comércios.</p>
        <div className="delivery-form-grid">
          <label>Nome<input name="nome" required defaultValue={edicaoEntregador?.nome} /></label>
          <label>Telefone<input name="telefone" type="tel" required defaultValue={edicaoEntregador?.telefone} /></label>
          <label><FieldLabel hint={<> {edicaoEntregador && "(opcional)"} </>}> {edicaoEntregador ? 'Nova senha' : 'Senha temporária'} </FieldLabel><input name="senha" type="password" minLength={12} maxLength={72} required={!edicaoEntregador} autoComplete="new-password" /></label>
        </div>
        <div className="delivery-actions"><button disabled={ocupado}>{edicaoEntregador ? 'Salvar entregador' : 'Cadastrar entregador'}</button>{edicaoEntregador && <button type="button" className="delivery-secondary" onClick={() => setEdicaoEntregador(null)}>Cancelar edição</button>}</div>
      </form>
      <div className="delivery-card">
        <h2>Entregadores cadastrados</h2>
        <EstadoLista carregando={carregandoEntregadores} erro={erroEntregadores} vazio={!entregadores.length} onRetry={() => void carregarEntregadores()} tituloVazio="Nenhum entregador cadastrado." mensagemVazia="Cadastre um entregador livre usando o formulário ao lado.">
        {paginacaoEntregadores.itensPagina.map(entregador => <article key={entregador._id} style={{ borderTop: '1px solid #dce4dc', padding: '12px 0' }}>
          <strong>{entregador.nome}</strong><p className="delivery-muted">{entregador.telefone} · {entregador.tenantId?.nome || 'Livre'} · {entregador.ativo === false ? 'Desativado' : entregador.status === 'offline' ? 'Offline' : entregador.status === 'em_entrega' ? 'Em entrega' : 'Disponível'}</p>
          <div className="delivery-actions"><button type="button" className="delivery-secondary" onClick={() => setEdicaoEntregador(entregador)}>Editar</button><button type="button" className="delivery-secondary" disabled={ocupado} onClick={() => void agir(async () => { const ativo = entregador.ativo === false; await deliveryApi.put(`/plataforma/entregadores/${entregador._id}`, { ativo }); setAviso(ativo ? 'Entregador ativado.' : 'Entregador desativado.'); }, entregador.ativo === false ? 'Entregador ativado.' : 'Entregador desativado.')}>{entregador.ativo === false ? 'Ativar' : 'Desativar'}</button><ConfirmarAcao titulo="Excluir entregador" mensagem={`Excluir permanentemente ${entregador.nome}?`} acaoTexto="Excluir entregador" onConfirmar={() => void agir(async () => { await deliveryApi.delete(`/plataforma/entregadores/${entregador._id}`); if (edicaoEntregador?._id === entregador._id) setEdicaoEntregador(null); setAviso('Entregador excluído.'); }, 'Entregador excluído.')}>{({ onClick }) => <button type="button" className="delivery-danger" disabled={ocupado} onClick={onClick}>Excluir</button>}</ConfirmarAcao></div>
        </article>)}
        </EstadoLista>
        <Paginacao prefixo="plataforma-entregadores" total={paginacaoEntregadores.total} paginaAtual={paginacaoEntregadores.paginaAtual} limiteAtual={paginacaoEntregadores.limiteAtual} onChangePagina={paginacaoEntregadores.alterarPagina} onChangeLimite={paginacaoEntregadores.alterarLimite} />
      </div>
    </section>
  </>;
}

export default function DeliveryPlataforma() { return <DeliveryPortal plataforma><PainelPlataforma /></DeliveryPortal>; }

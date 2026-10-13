import SearchableSelect from '../components/SearchableSelect.jsx';
import { useCallback, useContext, useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { AuthContext } from '../context/AuthContextDefinition.jsx';
import { useToast } from '../components/useToast.js';
import AreaTabs from '../components/AreaTabs.jsx';
import api from '../services/api.jsx';

const roles = { operador: 'Operador', cozinha: 'Cozinha', garcom: 'Garçom', admin: 'Administrador' };
const policyMessage = 'Use pelo menos 12 caracteres e no máximo 72 bytes UTF-8 (acentos e emojis usam mais bytes).';
const validPassword = password => Array.from(password).length >= 12 && new TextEncoder().encode(password).length <= 72;
const errorMessage = error => error.response?.data?.msg || error.response?.data?.errors?.[0]?.msg || 'Não foi possível concluir a operação';
const emptyForm = { username: '', password: '', role: 'operador' };
const emptyEdit = { role: 'operador', ativo: true, password: '' };

export default function Users() {
  const { user } = useContext(AuthContext);
  const { showToast } = useToast();
  const [form, setForm] = useState(emptyForm);
  const [users, setUsers] = useState([]);
  const [couriers, setCouriers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [listLoading, setListLoading] = useState(true);
  const [couriersLoading, setCouriersLoading] = useState(true);
  const [listError, setListError] = useState('');
  const [couriersError, setCouriersError] = useState('');
  const [busy, setBusy] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [edit, setEdit] = useState(emptyEdit);
  const [courierEdit, setCourierEdit] = useState(null);

  const loadUsers = useCallback(async () => {
    setListLoading(true);
    setListError('');
    try { setUsers((await api.get('/auth/users')).data); }
    catch (error) { setListError(errorMessage(error)); }
    finally { setListLoading(false); }
  }, []);

  const loadCouriers = useCallback(async () => {
    setCouriersLoading(true);
    setCouriersError('');
    try { setCouriers((await api.get('/entregas/entregadores')).data || []); }
    catch (error) {
      setCouriers([]);
      setCouriersError(error.response?.status === 403
        ? 'Associe este usuário administrador a um comércio do Delivery para consultar os entregadores.'
        : errorMessage(error));
    } finally { setCouriersLoading(false); }
  }, []);

  useEffect(() => {
    if (user?.role !== 'admin') return;
    void loadUsers();
    void loadCouriers();
  }, [loadUsers, loadCouriers, user?.role]);

  if (user && user.role !== 'admin') return <Navigate to="/pdv" replace />;

  const handleSubmit = async event => {
    event.preventDefault();
    if (!validPassword(form.password)) return showToast(policyMessage, 'error');
    setLoading(true);
    try {
      await api.post('/auth/register', { username: form.username.trim().toLowerCase(), password: form.password, role: form.role });
      setForm(emptyForm);
      showToast('Usuário criado com sucesso!', 'success');
      await loadUsers();
    } catch (error) { showToast(errorMessage(error), 'error'); }
    finally { setLoading(false); }
  };

  const handleUpdate = async event => {
    event.preventDefault();
    if (edit.password && !validPassword(edit.password)) return showToast(policyMessage, 'error');
    setBusy(true);
    try {
      const body = { role: edit.role, ativo: edit.ativo, ...(edit.password ? { password: edit.password } : {}) };
      const { data } = await api.patch(`/auth/users/${editingId}`, body);
      setUsers(previous => previous.map(account => account.id === data.id ? data : account));
      setEditingId(null);
      setEdit(emptyEdit);
      showToast('Usuário atualizado. As sessões anteriores foram encerradas.', 'success');
    } catch (error) { showToast(errorMessage(error), 'error'); }
    finally { setBusy(false); }
  };

  const deleteUser = async account => {
    if (account.id === user?.id) return;
    if (!window.confirm(`Excluir permanentemente o usuário ${account.username}? Esta ação não pode ser desfeita.`)) return;
    setBusy(true);
    try {
      await api.delete(`/auth/users/${account.id}`);
      setUsers(previous => previous.filter(item => item.id !== account.id));
      if (editingId === account.id) { setEditingId(null); setEdit(emptyEdit); }
      showToast('Usuário excluído.', 'success');
    } catch (error) { showToast(errorMessage(error), 'error'); }
    finally { setBusy(false); }
  };

  const saveCourier = async event => {
    event.preventDefault();
    const formElement = event.currentTarget;
    const values = new FormData(formElement);
    const password = values.get('senha');
    if (password && !validPassword(password)) return showToast(policyMessage, 'error');
    const body = {
      nome: values.get('nome'),
      telefone: values.get('telefone'),
      ativo: values.get('ativo') === 'on',
      ...(password ? { senha: password } : {}),
    };
    setBusy(true);
    try {
      await api.put(`/entregas/entregadores/${courierEdit._id}`, body);
      setCourierEdit(null);
      showToast('Entregador atualizado.', 'success');
      await loadCouriers();
    } catch (error) { showToast(errorMessage(error), 'error'); }
    finally { setBusy(false); }
  };

  const deleteCourier = async courier => {
    if (!window.confirm(`Excluir permanentemente ${courier.nome}? Se houver pedidos associados, o cadastro deverá ser desativado para preservar o histórico.`)) return;
    setBusy(true);
    try {
      await api.delete(`/entregas/entregadores/${courier._id}`);
      if (courierEdit?._id === courier._id) setCourierEdit(null);
      showToast('Entregador excluído.', 'success');
      await loadCouriers();
    } catch (error) { showToast(errorMessage(error), 'error'); }
    finally { setBusy(false); }
  };

  const courierBelongsToTenant = courier => Boolean(courier.tenantId);

  return (
    <section className="users-page" style={{ maxWidth: 1000, margin: '0 auto' }}>
      <AreaTabs area="pessoas" />
      <div className="page-heading"><div><h1>Usuários</h1><p>Cadastre e gerencie os acessos da equipe e os entregadores do comércio.</p></div></div>
      <form onSubmit={handleSubmit} style={panelStyle}>
        <h2>Novo usuário</h2>
        <label style={labelStyle}>Usuário
          <input value={form.username} onChange={event => setForm({ ...form, username: event.target.value })} minLength={2} maxLength={254} required autoComplete="username" style={inputStyle} />
        </label>
        <label style={labelStyle}>Senha
          <input type="password" value={form.password} onChange={event => setForm({ ...form, password: event.target.value })} minLength={12} required autoComplete="new-password" aria-describedby="new-password-policy" style={inputStyle} />
        </label>
        <p id="new-password-policy">{policyMessage}</p>
        <label style={labelStyle}>Perfil
          <SearchableSelect value={form.role} onChange={event => setForm({ ...form, role: event.target.value })} style={inputStyle}>
            {Object.entries(roles).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </SearchableSelect>
        </label>
        <button type="submit" disabled={loading || busy} style={buttonStyle}>{loading ? 'Criando...' : 'Criar usuário'}</button>
      </form>

      <div className="users-panel" style={{ ...panelStyle, marginTop: 24 }}>
        <h2>Acessos da equipe</h2>
        <p>Alterar perfil, bloquear ou redefinir senha encerra as sessões anteriores desse usuário.</p>
        {listLoading && <p role="status">Carregando usuários...</p>}
        {listError && <div role="alert" className="users-error"><p>{listError}</p><button type="button" className="users-secondary-button" onClick={() => void loadUsers()}>Tentar novamente</button></div>}
        {!listLoading && !listError && users.length === 0 && <p>Nenhum usuário cadastrado.</p>}
        {!listLoading && !listError && users.length > 0 && <div style={{ overflowX: 'auto' }}>
          <table style={tableStyle}>
            <thead><tr><th scope="col">Usuário</th><th scope="col">Perfil</th><th scope="col">Estado</th><th scope="col">Ações</th></tr></thead>
            <tbody>{users.map(account => <tr key={account.id}>
              <td style={cellStyle}>{account.username}{account.id === user?.id && <span className="users-current-user"> Você</span>}</td>
              <td style={cellStyle}>{roles[account.role]}</td>
              <td style={cellStyle}>{account.ativo ? 'Ativo' : 'Bloqueado'}</td>
              <td style={cellStyle}><div className="users-actions">
                <button type="button" className="users-secondary-button" disabled={busy} aria-label={`Editar ${account.username}`} onClick={() => { setEditingId(account.id); setEdit({ role: account.role, ativo: account.ativo, password: '' }); }}>Editar</button>
                <button type="button" className="users-danger-button" disabled={busy || account.id === user?.id} title={account.id === user?.id ? 'Não é possível excluir o usuário conectado' : undefined} aria-label={`Excluir ${account.username}`} onClick={() => void deleteUser(account)}>Excluir</button>
              </div></td>
            </tr>)}</tbody>
          </table>
        </div>}
        {editingId && <form onSubmit={handleUpdate} style={{ marginTop: 24 }} key={editingId}>
          <h3>Editar {users.find(account => account.id === editingId)?.username}</h3>
          <label style={labelStyle}>Perfil
            <SearchableSelect value={edit.role} onChange={event => setEdit({ ...edit, role: event.target.value })} style={inputStyle}>
              {Object.entries(roles).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </SearchableSelect>
          </label>
          <label style={labelStyle}><input type="checkbox" checked={edit.ativo} onChange={event => setEdit({ ...edit, ativo: event.target.checked })} /> Acesso ativo</label>
          <label style={labelStyle}>Nova senha (deixe vazio para manter a atual)
            <input type="password" value={edit.password} onChange={event => setEdit({ ...edit, password: event.target.value })} minLength={12} autoComplete="new-password" aria-describedby="reset-password-policy" style={inputStyle} />
          </label>
          <p id="reset-password-policy">{policyMessage}</p>
          <div className="users-actions">
            <button type="submit" disabled={busy} style={buttonStyle}>{busy ? 'Salvando...' : 'Salvar alterações'}</button>
            <button type="button" className="users-secondary-button" disabled={busy} onClick={() => { setEditingId(null); setEdit(emptyEdit); }}>Cancelar</button>
          </div>
        </form>}
      </div>

      <div className="users-panel" style={{ ...panelStyle, marginTop: 24 }}>
        <h2>Entregadores cadastrados</h2>
        <p>Entregadores com pedidos associados não podem ser excluídos; desative o cadastro para preservar o histórico.</p>
        {couriersLoading && <p role="status">Carregando entregadores...</p>}
        {couriersError && <div role="alert" className="users-error"><p>{couriersError}</p><button type="button" className="users-secondary-button" onClick={() => void loadCouriers()}>Tentar novamente</button></div>}
        {!couriersLoading && !couriersError && couriers.length === 0 && <p>Nenhum entregador cadastrado para este comércio.</p>}
        {!couriersLoading && !couriersError && couriers.length > 0 && <div style={{ overflowX: 'auto' }}>
          <table style={tableStyle}>
            <thead><tr><th scope="col">Entregador</th><th scope="col">Telefone</th><th scope="col">Estado</th><th scope="col">Ações</th></tr></thead>
            <tbody>{couriers.map(courier => {
              const canManage = courierBelongsToTenant(courier);
              return <tr key={courier._id}>
                <td style={cellStyle}>{courier.nome}{!canManage && <span className="users-current-user"> Compartilhado</span>}</td>
                <td style={cellStyle}>{courier.telefone}</td>
                <td style={cellStyle}>{courier.ativo === false ? 'Desativado' : courier.status === 'offline' ? 'Offline' : courier.status === 'em_entrega' ? 'Em entrega' : 'Disponível'}</td>
                <td style={cellStyle}>{canManage ? <div className="users-actions">
                  <button type="button" className="users-secondary-button" disabled={busy} aria-label={`Editar ${courier.nome}`} onClick={() => setCourierEdit(courier)}>Editar</button>
                  <button type="button" className="users-danger-button" disabled={busy} aria-label={`Excluir ${courier.nome}`} onClick={() => void deleteCourier(courier)}>Excluir</button>
                </div> : <span className="users-muted">Gerenciado pelo cadastro de origem</span>}</td>
              </tr>;
            })}</tbody>
          </table>
        </div>}
        {courierEdit && <form onSubmit={event => void saveCourier(event)} style={{ marginTop: 24 }} key={courierEdit._id}>
          <h3>Editar entregador: {courierEdit.nome}</h3>
          <label style={labelStyle}>Nome<input name="nome" required maxLength={160} defaultValue={courierEdit.nome} style={inputStyle} /></label>
          <label style={labelStyle}>Telefone<input name="telefone" type="tel" required maxLength={30} defaultValue={courierEdit.telefone} style={inputStyle} /></label>
          <label style={labelStyle}>Nova senha (opcional)<input name="senha" type="password" minLength={12} maxLength={72} autoComplete="new-password" aria-describedby="courier-password-policy" style={inputStyle} /></label>
          <p id="courier-password-policy">{policyMessage}</p>
          <label style={labelStyle}><input name="ativo" type="checkbox" defaultChecked={courierEdit.ativo !== false} /> Cadastro ativo</label>
          <div className="users-actions">
            <button type="submit" disabled={busy} style={buttonStyle}>{busy ? 'Salvando...' : 'Salvar entregador'}</button>
            <button type="button" className="users-secondary-button" disabled={busy} onClick={() => setCourierEdit(null)}>Cancelar</button>
          </div>
        </form>}
      </div>
      <style>{`
        .users-page .users-actions{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
        .users-page .users-secondary-button,.users-page .users-danger-button{min-height:36px;padding:7px 12px;border:1px solid var(--border-color);border-radius:8px;font-size:13px;font-weight:700;cursor:pointer}
        .users-page .users-secondary-button{background:var(--bg-tertiary);color:var(--text-primary)}
        .users-page .users-danger-button{border-color:rgba(239,68,68,.24);background:var(--error-bg);color:var(--error-text,var(--error-bg))}
        .users-page .users-secondary-button:disabled,.users-page .users-danger-button:disabled{opacity:.55;cursor:not-allowed}
        .users-page .users-current-user{margin-left:6px;color:var(--text-secondary);font-size:12px}
        .users-page .users-muted{color:var(--text-secondary);font-size:12px}
        .users-page .users-error{color:var(--error-text,var(--text-primary))}
        .users-page th{padding:10px 8px;border-bottom:1px solid var(--border-color);text-align:left}
        @media(max-width:600px){.users-page>form,.users-page .users-panel{padding:16px!important}.users-page .users-actions button{flex:1}}
      `}</style>
    </section>
  );
}

const panelStyle = { background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', padding: 24, borderRadius: 16, boxShadow: 'var(--shadow-sm)' };
const labelStyle = { display: 'block', marginBottom: 16, color: 'var(--text-secondary)', fontWeight: 600 };
const inputStyle = { display: 'block', width: '100%', marginTop: 7, padding: '12px 14px', border: '1px solid var(--border-color)', borderRadius: 9, fontSize: 16, boxSizing: 'border-box', background: 'var(--input-bg)', color: 'var(--input-text)' };
const buttonStyle = { padding: 14, border: 0, borderRadius: 10, background: 'var(--accent-primary)', color: '#fff', fontWeight: 700, fontSize: 15, cursor: 'pointer' };
const tableStyle = { width: '100%', borderCollapse: 'collapse' };
const cellStyle = { padding: '12px 8px', borderBottom: '1px solid var(--border-color)', textAlign: 'left' };

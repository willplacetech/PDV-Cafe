import { useCallback, useContext, useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { AuthContext } from '../context/AuthContextDefinition.jsx';
import { useToast } from '../components/useToast.js';
import AreaTabs from '../components/AreaTabs.jsx';
import api from '../services/api.jsx';

const roles = { operador: 'Operador', cozinha: 'Cozinha', garcom: 'Garçom', admin: 'Administrador' };
const policyMessage = 'Use pelo menos 12 caracteres e no máximo 72 bytes UTF-8 (acentos e emojis usam mais bytes).';
const validPassword = password => Array.from(password).length >= 12 && new TextEncoder().encode(password).length <= 72;
const errorMessage = error => error.response?.data?.msg || error.response?.data?.errors?.[0]?.msg || 'Não foi possível salvar o usuário';
const emptyForm = { username: '', password: '', role: 'operador' };

export default function Users() {
  const { user } = useContext(AuthContext);
  const { showToast } = useToast();
  const [form, setForm] = useState(emptyForm);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState('');
  const [busyId, setBusyId] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [edit, setEdit] = useState({ role: 'operador', ativo: true, password: '' });

  const loadUsers = useCallback(async () => {
    setListLoading(true);
    setListError('');
    try { setUsers((await api.get('/auth/users')).data); }
    catch (error) { setListError(errorMessage(error)); }
    finally { setListLoading(false); }
  }, []);

  useEffect(() => {
    if (user?.role !== 'admin') return;
    let active = true;
    api.get('/auth/users')
      .then(({ data }) => { if (active) setUsers(data); })
      .catch(error => { if (active) setListError(errorMessage(error)); })
      .finally(() => { if (active) setListLoading(false); });
    return () => { active = false; };
  }, [user?.role]);

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
    setBusyId(editingId);
    try {
      const body = { role: edit.role, ativo: edit.ativo, ...(edit.password ? { password: edit.password } : {}) };
      const { data } = await api.patch(`/auth/users/${editingId}`, body);
      setUsers(previous => previous.map(account => account.id === data.id ? data : account));
      setEditingId(null);
      setEdit({ role: 'operador', ativo: true, password: '' });
      showToast('Usuário atualizado. As sessões anteriores foram encerradas.', 'success');
    } catch (error) { showToast(errorMessage(error), 'error'); }
    finally { setBusyId(null); }
  };

  return (
    <section style={{ maxWidth: 900, margin: '0 auto' }}>
      <AreaTabs area="pessoas" />
      <div className="page-heading"><div><h1>Usuários</h1><p>Cadastre acessos e gerencie sua equipe.</p></div></div>
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
          <select value={form.role} onChange={event => setForm({ ...form, role: event.target.value })} style={inputStyle}>
            {Object.entries(roles).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        <button type="submit" disabled={loading} style={buttonStyle}>{loading ? 'Criando...' : 'Criar usuário'}</button>
      </form>

      <div style={{ ...panelStyle, marginTop: 24 }}>
        <h2>Acessos da equipe</h2>
        <p>Alterar perfil, bloquear ou redefinir senha encerra as sessões anteriores desse usuário. Senhas antigas continuam funcionando até serem redefinidas.</p>
        {listLoading && <p role="status">Carregando usuários...</p>}
        {listError && <div role="alert"><p>{listError}</p><button type="button" onClick={loadUsers}>Tentar novamente</button></div>}
        {!listLoading && !listError && users.length === 0 && <p>Nenhum usuário cadastrado.</p>}
        {!listLoading && !listError && users.length > 0 && <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr><th scope="col">Usuário</th><th scope="col">Perfil</th><th scope="col">Estado</th><th scope="col">Ações</th></tr></thead>
            <tbody>{users.map(account => <tr key={account.id}>
              <td style={cellStyle}>{account.username}</td><td style={cellStyle}>{roles[account.role]}</td><td style={cellStyle}>{account.ativo ? 'Ativo' : 'Bloqueado'}</td>
              <td style={cellStyle}><button type="button" disabled={busyId !== null} aria-label={`Gerenciar ${account.username}`} onClick={() => { setEditingId(account.id); setEdit({ role: account.role, ativo: account.ativo, password: '' }); }}>Gerenciar</button></td>
            </tr>)}</tbody>
          </table>
        </div>}
        {editingId && <form onSubmit={handleUpdate} style={{ marginTop: 24 }}>
          <h3>Gerenciar {users.find(account => account.id === editingId)?.username}</h3>
          <label style={labelStyle}>Perfil
            <select value={edit.role} onChange={event => setEdit({ ...edit, role: event.target.value })} style={inputStyle}>
              {Object.entries(roles).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          <label style={labelStyle}><input type="checkbox" checked={edit.ativo} onChange={event => setEdit({ ...edit, ativo: event.target.checked })} /> Acesso ativo</label>
          <label style={labelStyle}>Nova senha (deixe vazio para manter a atual)
            <input type="password" value={edit.password} onChange={event => setEdit({ ...edit, password: event.target.value })} minLength={12} autoComplete="new-password" aria-describedby="reset-password-policy" style={inputStyle} />
          </label>
          <p id="reset-password-policy">{policyMessage}</p>
          <button type="submit" disabled={busyId !== null} style={buttonStyle}>{busyId ? 'Salvando...' : 'Salvar alterações'}</button>{' '}
          <button type="button" disabled={busyId !== null} onClick={() => { setEditingId(null); setEdit({ role: 'operador', ativo: true, password: '' }); }}>Cancelar</button>
        </form>}
      </div>
    </section>
  );
}

const panelStyle = { background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', padding: 24, borderRadius: 16, boxShadow: 'var(--shadow-sm)' };
const labelStyle = { display: 'block', marginBottom: 16, color: 'var(--text-secondary)', fontWeight: 600 };
const inputStyle = { display: 'block', width: '100%', marginTop: 7, padding: '12px 14px', border: '1px solid var(--border-color)', borderRadius: 9, fontSize: 16, boxSizing: 'border-box', background: 'var(--input-bg)', color: 'var(--input-text)' };
const buttonStyle = { padding: 14, border: 0, borderRadius: 10, background: 'var(--accent-primary)', color: '#fff', fontWeight: 700, fontSize: 15, cursor: 'pointer' };
const cellStyle = { padding: '12px 8px', borderBottom: '1px solid var(--border-color)', textAlign: 'left' };

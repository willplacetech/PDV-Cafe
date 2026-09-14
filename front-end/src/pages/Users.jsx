import { useContext, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext.jsx';
import { useToast } from '../components/Toast.jsx';
import api from '../services/api.jsx';

export default function Users() {
  const { user } = useContext(AuthContext);
  const { showToast } = useToast();
  const [form, setForm] = useState({ username: '', password: '', role: 'operador' });
  const [loading, setLoading] = useState(false);

  if (user && user.role !== 'admin') return <Navigate to="/pdv" replace />;

  const handleSubmit = async (event) => {
    event.preventDefault();
    setLoading(true);
    try {
      await api.post('/auth/register', {
        username: form.username.trim().toLowerCase(),
        password: form.password,
        role: form.role,
      });
      setForm({ username: '', password: '', role: 'operador' });
      showToast('Usuário criado com sucesso!', 'success');
    } catch (error) {
      const message = error.response?.data?.msg
        || error.response?.data?.errors?.[0]?.msg
        || 'Não foi possível criar o usuário';
      showToast(message, 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <section style={{ maxWidth: 620, margin: '0 auto' }}>
      <div className="page-heading">
        <div>
          <h1>Novo usuário</h1>
          <p>Cadastre acessos para sua equipe.</p>
        </div>
      </div>
      <form onSubmit={handleSubmit} style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', padding: 24, borderRadius: 16, boxShadow: 'var(--shadow-sm)' }}>
        <label style={{ display: 'block', marginBottom: 16, color: 'var(--text-secondary)', fontWeight: 600 }}>
          Usuário
          <input
            value={form.username}
            onChange={(event) => setForm({ ...form, username: event.target.value })}
            minLength={2}
            required
            autoComplete="username"
            style={inputStyle}
          />
        </label>
        <label style={{ display: 'block', marginBottom: 16, color: 'var(--text-secondary)', fontWeight: 600 }}>
          Senha
          <input
            type="password"
            value={form.password}
            onChange={(event) => setForm({ ...form, password: event.target.value })}
            minLength={4}
            required
            autoComplete="new-password"
            style={inputStyle}
          />
        </label>
        <label style={{ display: 'block', marginBottom: 22, color: 'var(--text-secondary)', fontWeight: 600 }}>
          Perfil
          <select value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value })} style={inputStyle}>
            <option value="operador">Operador</option>
            <option value="cozinha">Cozinha</option>
            <option value="garcom">Garçom</option>
            <option value="admin">Administrador</option>
          </select>
        </label>
        <button type="submit" disabled={loading} style={{ width: '100%', padding: 14, border: 0, borderRadius: 10, background: 'var(--accent-primary)', color: '#fff', fontWeight: 700, fontSize: 15, cursor: loading ? 'wait' : 'pointer' }}>
          {loading ? 'Criando...' : 'Criar usuário'}
        </button>
      </form>
    </section>
  );
}

const inputStyle = {
  display: 'block', width: '100%', marginTop: 7, padding: '12px 14px',
  border: '1px solid var(--border-color)', borderRadius: 9, fontSize: 16,
  boxSizing: 'border-box', background: 'var(--input-bg)', color: 'var(--input-text)',
};

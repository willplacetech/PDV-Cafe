import { useState, useContext, useEffect } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { AuthContext } from '../context/AuthContextDefinition.jsx';
import { ThemeContext } from '../context/ThemeContextDefinition.js';
import { useToast } from '../components/useToast.js';
import { branding } from '../config/branding.js';

export default function Login() {
  const [form, setForm] = useState({ username: '', password: '' });
  const [installPrompt, setInstallPrompt] = useState(null);
  const [showInstallButton, setShowInstallButton] = useState(false);
  const { login, user } = useContext(AuthContext);
  const { isDark, toggleTheme } = useContext(ThemeContext);
  const { showToast } = useToast();
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const handleBeforeInstallPrompt = (event) => {
      event.preventDefault();
      setInstallPrompt(event);
      setShowInstallButton(true);
    };
    const handleAppInstalled = () => {
      setInstallPrompt(null);
      setShowInstallButton(false);
      showToast('App instalado com sucesso!', 'success');
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, [showToast]);

  if (user) return <Navigate to={user.role === 'admin' ? '/dashboard' : '/pdv'} replace />;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await login(form.username.trim().toLowerCase(), form.password);
    } catch (err) {
      const mensagem = err.response?.data?.msg || 'Usuário ou senha inválidos';
      showToast(mensagem, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleInstallClick = async () => {
    if (!installPrompt) return;

    installPrompt.prompt();
    const choice = await installPrompt.userChoice;

    if (choice.outcome === 'accepted') {
      showToast('Instalação iniciada!', 'success');
    } else {
      showToast('Instalação cancelada.', 'info');
    }

    setInstallPrompt(null);
    setShowInstallButton(false);
  };

  return (
    <div className="login-shell" style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'var(--bg-primary)',
      padding: 20, fontFamily: 'var(--font-body)',
      transition: 'background 0.3s ease'
    }}>
      <div style={{
        background: 'var(--bg-secondary)', padding: '36px 28px', borderRadius: 16,
        boxShadow: 'var(--shadow-lg)', width: '100%', maxWidth: 400,
        textAlign: 'center', color: 'var(--text-primary)',
        border: '1px solid var(--border-color)',
        position: 'relative'
      }}>
        <div style={{
          position: 'absolute', top: 16, right: 16,
          display: 'flex', gap: '8px'
        }}>
          {showInstallButton && (
            <button type="button" onClick={handleInstallClick} style={{
              background: 'var(--accent-primary)', color: 'var(--accent-text)',
              border: 'none', padding: '8px 12px', borderRadius: 8, fontSize: 13,
              cursor: 'pointer', fontFamily: 'inherit', fontWeight: 700,
              display: 'flex', alignItems: 'center', gap: 6,
              minHeight: 40
            }} title="Instalar app">
              ⬇️ Instalar
            </button>
          )}
          <button type="button" onClick={toggleTheme} style={{
            background: 'var(--bg-tertiary)', color: 'var(--text-primary)',
            border: '1px solid var(--border-color)',
            padding: '8px 12px', borderRadius: 8, fontSize: 16,
            cursor: 'pointer', fontFamily: 'inherit',
            minHeight: 40
          }} title={isDark ? 'Modo claro' : 'Modo escuro'}>
            {isDark ? '☀️' : '🌙'}
          </button>
        </div>

        <img
          src={branding.logoUrl}
          alt={branding.name}
          style={{
            width: 88, height: 88, objectFit: 'contain', borderRadius: 20,
            margin: '8px auto 16px', display: 'block',
            boxShadow: 'var(--shadow-sm)'
          }}
        />

        <h1 style={{
          fontFamily: 'var(--font-heading)', fontSize: 24, fontWeight: 700,
          margin: '0 0 4px', color: 'var(--text-primary)'
        }}>{branding.name}</h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: 14, margin: '0 0 24px' }}>
          {branding.tagline}
        </p>

        <form onSubmit={handleSubmit}>
          <div style={{ textAlign: 'left', marginBottom: 14 }}>
            <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6, display: 'block' }}>Usuário</label>
            <input
              placeholder="Digite seu usuário"
              value={form.username}
              autoComplete="username"
              onChange={e => setForm({ ...form, username: e.target.value })}
              required
              style={{ width: '100%' }}
            />
          </div>

          <div style={{ textAlign: 'left', marginBottom: 20 }}>
            <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6, display: 'block' }}>Senha</label>
            <input
              type="password"
              placeholder="Digite sua senha"
              value={form.password}
              autoComplete="current-password"
              onChange={e => setForm({ ...form, password: e.target.value })}
              required
              style={{ width: '100%' }}
            />
          </div>

          <button type="submit" disabled={loading} style={{
            width: '100%', padding: '14px', background: 'var(--accent-primary)', color: 'var(--accent-text)',
            border: 'none', borderRadius: 10, fontSize: 16, fontWeight: 700,
            cursor: 'pointer', transition: 'all .15s', minHeight: 48
          }}>
            {loading ? 'Entrando...' : 'Entrar'}
          </button>
        </form>

        <Link to="/entregador" style={{
          width: '100%', marginTop: 14, padding: '13px 14px',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'var(--bg-tertiary)', color: 'var(--text-primary)',
          border: '1px solid var(--border-color)', borderRadius: 10,
          fontSize: 14, fontWeight: 700, textDecoration: 'none',
          minHeight: 48, boxSizing: 'border-box',
        }}>
          Acesso do entregador
        </Link>

        {showInstallButton && (
          <button type="button" onClick={handleInstallClick} style={{
            width: '100%', marginTop: 14, padding: '14px',
            background: 'var(--success-bg)', color: '#fff',
            border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 700,
            cursor: 'pointer', minHeight: 48,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8
          }} title={`Instalar ${branding.name} no seu dispositivo`}>
            ⬇️ Instalar App
          </button>
        )}
        {!showInstallButton && (
          <div style={{ marginTop: 14, textAlign: 'center', fontSize: 12, color: 'var(--text-secondary)' }}>
            <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, opacity: 0.8, lineHeight: 1.4 }}>
              📲 Para instalar, use o menu do navegador e escolha <strong>Instalar aplicativo</strong>.
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

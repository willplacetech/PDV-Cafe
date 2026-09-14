import { useState, useContext, useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext.jsx';
import { ThemeContext } from '../context/ThemeContext.jsx';
import { useToast } from '../components/Toast.jsx';

export default function Login() {
  const imagensMarca = ['/Abraco5.png', '/Abraco10.png', '/Abraco11.png'];
  const [form, setForm] = useState({ username: '', password: '' });
  const [imagemAtiva, setImagemAtiva] = useState(0);
  const [installPrompt, setInstallPrompt] = useState(null);
  const [showInstallButton, setShowInstallButton] = useState(false);
  const { login, user } = useContext(AuthContext);
  const { isDark, toggleTheme } = useContext(ThemeContext);
  const { showToast } = useToast();
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const intervalo = window.setInterval(() => setImagemAtiva((atual) => (atual + 1) % imagensMarca.length), 5000);
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
      window.clearInterval(intervalo);
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, [imagensMarca.length, showToast]);

  if (user) return <Navigate to="/pdv" />;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      // Remove credenciais e dados persistidos de versões anteriores antes de autenticar novamente.
      localStorage.clear();
      await login(form.username.trim().toLowerCase(), form.password);
      window.location.reload();
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
      background: isDark
        ? 'linear-gradient(160deg, var(--bg-primary) 0%, var(--bg-secondary) 55%, var(--bg-tertiary) 100%)'
        : 'linear-gradient(160deg, var(--bg-primary) 0%, var(--bg-secondary) 55%, var(--bg-tertiary) 100%)',
      padding: 20, fontFamily: 'var(--font-body)',
      transition: 'background 0.3s ease'
    }}>
      <div className="login-layout" style={{
        display: 'grid', gridTemplateColumns: 'minmax(280px, .95fr) minmax(340px, 420px)',
        gap: 24, alignItems: 'stretch', width: '100%', maxWidth: 900,
      }}>
        <div className="login-brand-panel" style={{ position: 'relative', minHeight: 560, borderRadius: 20, overflow: 'hidden', boxShadow: 'var(--shadow-lg)', background: 'var(--brand-brown)' }}>
          {imagensMarca.map((imagem, indice) => <img key={imagem} src={imagem} alt="Atmosfera do Sabor de Abraço" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', opacity: imagemAtiva === indice ? 1 : 0, transition: 'opacity .8s ease' }} />)}
          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(48, 28, 19, .08), rgba(48, 28, 19, .78))' }} />
          <div style={{ position: 'absolute', left: 26, right: 26, bottom: 26, color: '#fff8ed' }}><span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.1em' }}>CAFÉS ESPECIAIS · CONFEITARIA AFETIVA</span><h2 style={{ fontFamily: 'var(--font-heading)', fontSize: 32, margin: '8px 0 4px', color: '#fff8ed' }}>Um abraço em cada pausa.</h2><p style={{ margin: 0, fontSize: 13, opacity: .9 }}>Atenda com calma. A casa começa no primeiro carinho.</p><div style={{ display: 'flex', gap: 6, marginTop: 18 }}>{imagensMarca.map((imagem, indice) => <button key={imagem} type="button" onClick={() => setImagemAtiva(indice)} aria-label={`Ver imagem ${indice + 1}`} style={{ width: 28, height: 6, minHeight: 6, padding: 0, border: 0, borderRadius: 4, background: imagemAtiva === indice ? '#fff8ed' : 'rgba(255,248,237,.45)', cursor: 'pointer' }} />)}</div></div>
        </div>
        <div style={{
        background: 'var(--bg-secondary)', padding: '36px 28px', borderRadius: 20,
        boxShadow: 'var(--shadow-lg)', width: '100%', maxWidth: 380,
        textAlign: 'center', color: 'var(--text-primary)'
      }}>
        <div style={{
          position: 'absolute', top: 20, right: 20,
          display: 'flex', gap: '10px'
        }}>
          {showInstallButton && (
            <button onClick={handleInstallClick} style={{
              background: 'var(--accent-primary)', color: '#fff',
              border: 'none', padding: '10px 14px', borderRadius: '10px', fontSize: '14px',
              cursor: 'pointer', fontFamily: 'inherit', fontWeight: 700,
              display: 'flex', alignItems: 'center', gap: '6px',
              transition: 'all 0.2s ease', boxShadow: 'var(--shadow-sm)'
            }} title="Instalar app">
              ⬇️ Instalar
            </button>
          )}
          <button onClick={toggleTheme} style={{
            background: 'var(--bg-tertiary)', color: 'var(--text-primary)',
            border: '1px solid var(--border-color)',
            padding: '10px 16px', borderRadius: '10px', fontSize: '16px',
            cursor: 'pointer', fontFamily: 'inherit',
            display: 'flex', alignItems: 'center', gap: '6px',
            transition: 'all 0.2s ease'
          }} title={isDark ? 'Modo claro' : 'Modo escuro'}>
            {isDark ? '☀️' : '🌙'}
          </button>
        </div>

        <img src="/Abraco1.png" alt="Sabor de Abraço" style={{ width: 112, height: 112, objectFit: 'cover', borderRadius: '50%', margin: '0 auto 12px', display: 'block', boxShadow: 'var(--shadow-sm)' }} />

        <h1 style={{ fontFamily: 'var(--font-heading)', fontSize: 28, fontWeight: 700, margin: '0 0 4px', color: 'var(--brand-brown)' }}>Sabor de Abraço</h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: 14, margin: '0 0 20px' }}>
          Cafés especiais · confeitaria afetiva
        </p>
        <div style={{ margin: '0 auto 20px', padding: '9px 12px', borderRadius: 10, background: 'var(--accent-light)', border: '1px solid var(--accent-border)', color: 'var(--brand-brown)', fontSize: 12, fontWeight: 700 }}>
          O cookie recheado é o abraço da casa
        </div>
          <form onSubmit={handleSubmit}>
            <div style={{ textAlign: 'left', marginBottom: 14 }}>
              <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6, display: 'block' }}>Usuário</label>
              <input
                placeholder="Digite seu usuário" value={form.username} autoComplete="username"
                onChange={e => setForm({ ...form, username: e.target.value })} required
                style={{
                  width: '100%', padding: '14px 16px', border: '1.5px solid var(--border-color)',
                  borderRadius: 12, fontSize: 16, boxSizing: 'border-box',
                  outline: 'none', transition: 'border-color .2s, background 0.2s, color 0.2s',
                  background: 'var(--input-bg)', color: 'var(--input-text)',
                  minHeight: 50
                }}
                onFocus={e => e.target.style.borderColor = 'var(--accent-primary)'}
                onBlur={e => e.target.style.borderColor = 'var(--border-color)'}
              />
            </div>

            <div style={{ textAlign: 'left', marginBottom: 20 }}>
              <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6, display: 'block' }}>Senha</label>
              <input
                type="password" placeholder="Digite sua senha" value={form.password} autoComplete="current-password"
                onChange={e => setForm({ ...form, password: e.target.value })} required
                style={{
                  width: '100%', padding: '14px 16px', border: '1.5px solid var(--border-color)',
                  borderRadius: 12, fontSize: 16, boxSizing: 'border-box',
                  outline: 'none', transition: 'border-color .2s, background 0.2s, color 0.2s',
                  background: 'var(--input-bg)', color: 'var(--input-text)',
                  minHeight: 50
                }}
                onFocus={e => e.target.style.borderColor = 'var(--accent-primary)'}
                onBlur={e => e.target.style.borderColor = 'var(--border-color)'}
              />
            </div>

            <button type="submit" disabled={loading} style={{
              width: '100%', padding: '14px', background: 'var(--accent-primary)', color: '#fff',
              border: 'none', borderRadius: 12, fontSize: 16, fontWeight: 700,
              cursor: 'pointer', transition: 'all .15s', minHeight: 52
            }}>
              {loading ? 'Entrando...' : 'Entrar no Sistema'}
            </button>
          </form>
        </div>
      </div>
      <style>{`@media (max-width: 760px) { .login-shell { align-items: flex-start !important; padding: 18px !important; } .login-layout { display: block !important; max-width: 420px !important; } .login-brand-panel { min-height: 220px !important; margin-bottom: 14px; } .login-brand-panel h2 { font-size: 24px !important; } .login-layout > div:last-child { max-width: none !important; padding: 28px 22px !important; } }`}</style>
    </div>
  );
}

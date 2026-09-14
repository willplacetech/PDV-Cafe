import { useContext, useState } from 'react';
import { Link, Outlet, useNavigate, useLocation } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext.jsx';
import { ThemeContext } from '../context/ThemeContext.jsx';


export default function Layout() {
  const { user, logout } = useContext(AuthContext);
  const { isDark, toggleTheme } = useContext(ThemeContext);
  const navigate = useNavigate();
  const location = useLocation();
  const [showConfirm, setShowConfirm] = useState(false);

  const sair = () => { logout(); navigate('/login'); };

  // ✅ Verificações de rota — UMA POR UMA, sem função
  const ativoPDV = location.pathname.startsWith('/pdv');
  const ativoProdutos = location.pathname.startsWith('/produtos');
  const ativoClientes = location.pathname.startsWith('/clientes');
  const ativoComandas = location.pathname.startsWith('/comandas');
  const ativoCozinha = location.pathname.startsWith('/cozinha');
  const ativoContasReceber = location.pathname.startsWith('/contas-receber');
  const ativoUsuarios = location.pathname.startsWith('/usuarios');
  const ativoDashboard = location.pathname.startsWith('/dashboard');
  const ativoProducao = location.pathname.startsWith('/producao');
  const ativoFinanceiro = location.pathname.startsWith('/financeiro');

  // ✅ Título e ícone — UMA POR UMA, sem função
  let iconePagina = '☕';
  let tituloPagina = 'Atendimento';

  if (location.pathname.startsWith('/pdv')) {
    iconePagina = '☕';
    tituloPagina = 'Atendimento';
  }
  if (location.pathname.startsWith('/produtos')) {
    iconePagina = '📦';
    tituloPagina = 'Produtos';
  }
  if (location.pathname.startsWith('/clientes')) {
    iconePagina = '👤';
    tituloPagina = 'Clientes';
  }
  if (location.pathname.startsWith('/comandas')) {
    iconePagina = '☕';
    tituloPagina = 'Comandas';
  }
  if (location.pathname.startsWith('/cozinha')) {
    iconePagina = '🍳';
    tituloPagina = 'Cozinha';
  }
  if (location.pathname.startsWith('/contas-receber')) {
    iconePagina = '💰';
    tituloPagina = 'A Receber';
  }
  if (location.pathname.startsWith('/usuarios')) {
    iconePagina = '👥';
    tituloPagina = 'Usuários';
  }
  if (location.pathname.startsWith('/dashboard')) {
    iconePagina = '📊';
    tituloPagina = 'Dashboard';
  }
  if (location.pathname.startsWith('/producao')) {
    iconePagina = '🧪';
    tituloPagina = 'Produção';
  }
  if (location.pathname.startsWith('/financeiro')) {
    iconePagina = '💰';
    tituloPagina = 'Financeiro';
  }


  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-primary)', fontFamily: 'var(--font-body)', color: 'var(--text-primary)', transition: 'background-color 0.3s ease, color 0.3s ease' }}>
      
      {/* ==========================================
          HEADER MOBILE
          ========================================== */}
      <header id="header-mobile">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
          <span style={{ fontSize: 22, lineHeight: 1 }}>{iconePagina}</span>
          <h1 style={{
            fontSize: 17, fontWeight: 700, margin: 0, color: 'var(--text-primary)',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
          }}>{tituloPagina}</h1>
        </div>

        <div style={{
          display: 'flex', borderRadius: 10, overflow: 'hidden',
          border: '1px solid var(--border-color)', height: 38, flexShrink: 0
        }}>
          <button onClick={toggleTheme} style={{
            background: 'transparent', color: 'var(--text-primary)',
            border: '1px solid var(--border-color)',
            borderRight: '1px solid var(--border-color)',
            padding: '0 10px', fontWeight: 700, fontSize: 16,
            cursor: 'pointer', fontFamily: 'inherit',
            display: 'flex', alignItems: 'center', gap: 4,
            transition: 'all 0.2s ease'
          }} title={isDark ? 'Modo claro' : 'Modo escuro'}>
            {isDark ? '☀️' : '🌙'}
          </button>
          <div style={{
            background: 'var(--success-bg)', color: 'var(--success-text)',
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '0 10px', fontWeight: 700, fontSize: 13
          }}>
            <div style={{
              width: 22, height: 22, borderRadius: '50%',
              background: 'rgba(255,255,255,.25)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 11, flexShrink: 0
            }}>{user?.username?.[0]?.toUpperCase()}</div>
            <span style={{ maxWidth: 70, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {user?.username}
            </span>
          </div>
          <button onClick={() => setShowConfirm(true)} style={{
            background: 'var(--error-bg)', color: 'var(--error-text)', border: 'none',
            borderLeft: '1px solid rgba(255,255,255,.2)',
            padding: '0 14px', fontWeight: 700, fontSize: 13,
            cursor: 'pointer', fontFamily: 'inherit',
            display: 'flex', alignItems: 'center', gap: 4
          }}>
            Sair
          </button>
        </div>
      </header>


      {/* ==========================================
          SIDEBAR DESKTOP — 260px
          ========================================== */}
      <aside id="sidebar-desktop">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 40 }}>
          <img src="/Abraco1.png" alt="Sabor de Abraço" style={{ width: 48, height: 48, borderRadius: '50%', objectFit: 'cover', border: '1px solid var(--brand-gold)' }} />
          <div>
            <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 17, color: 'var(--brand-brown)' }}>Sabor de Abraço</div>
            <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Cafeteria e confeitaria</div>
          </div>
        </div>

        <button onClick={toggleTheme} style={{
          width: '100%', padding: '10px',
          background: 'var(--bg-tertiary)', color: 'var(--text-primary)',
          border: '1px solid var(--border-color)',
          borderRadius: '10px', cursor: 'pointer',
          fontWeight: '600', fontSize: '13px',
          minHeight: '40px', fontFamily: 'inherit',
          marginBottom: '20px',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          gap: '6px',
          transition: 'all 0.2s ease'
        }} title={isDark ? 'Modo claro' : 'Modo escuro'}>
          {isDark ? '☀️ Modo Claro' : '🌙 Modo Escuro'}
        </button>

        <nav style={{ flex: 1, overflowY: 'auto' }}>
          <Link to="/pdv" className={ativoPDV ? 'nav-link active' : 'nav-link'}>
            <span style={{ fontSize: 18, flexShrink: 0 }}>🛒</span>
            <span style={{ whiteSpace: 'nowrap' }}>Novo Pedido</span>
          </Link>
          <Link to="/comandas" className={ativoComandas ? 'nav-link active' : 'nav-link'}>
            <span style={{ fontSize: 18, flexShrink: 0 }}>📋</span>
            <span style={{ whiteSpace: 'nowrap' }}>Comandas</span>
          </Link>
          {user?.role === 'admin' && <Link to="/contas-receber" className={ativoContasReceber ? 'nav-link active' : 'nav-link'}>
            <span style={{ fontSize: 18, flexShrink: 0 }}>💰</span>
            <span>A Receber</span>
          </Link>}
          {user?.role === 'admin' && <Link to="/produtos" className={ativoProdutos ? 'nav-link active' : 'nav-link'}>
            <span style={{ fontSize: 18, flexShrink: 0 }}>📦</span>
            <span style={{ whiteSpace: 'nowrap' }}>Produtos</span>
          </Link>}
          {user?.role === 'admin' && <Link to="/producao" className={ativoProducao ? 'nav-link active' : 'nav-link'}><span style={{ fontSize: 18, flexShrink: 0 }}>🧪</span><span style={{ whiteSpace: 'nowrap' }}>Produção</span></Link>}
          {(user?.role === 'admin' || user?.role === 'operador' || user?.role === 'cozinha') && <Link to="/cozinha" className={ativoCozinha ? 'nav-link active' : 'nav-link'}><span style={{ fontSize: 18, flexShrink: 0 }}>🍳</span><span style={{ whiteSpace: 'nowrap' }}>Cozinha</span></Link>}
          {user?.role === 'admin' && (
            <Link to="/usuarios" className={ativoUsuarios ? 'nav-link active' : 'nav-link'}>
              <span style={{ fontSize: 18, flexShrink: 0 }}>👥</span>
              <span>Usuários</span>
            </Link>
          )}
          {user?.role === 'admin' && <Link to="/clientes" className={ativoClientes ? 'nav-link active' : 'nav-link'}>
            <span style={{ fontSize: 18, flexShrink: 0 }}>👤</span>
            <span style={{ whiteSpace: 'nowrap' }}>Clientes</span>
          </Link>}
          {user?.role === 'admin' && <Link to="/financeiro" className={ativoFinanceiro ? 'nav-link active' : 'nav-link'}><span style={{ fontSize: 18, flexShrink: 0 }}>💵</span><span style={{ whiteSpace: 'nowrap' }}>Financeiro</span></Link>}
          {user?.role === 'admin' && <Link to="/dashboard" className={ativoDashboard ? 'nav-link active' : 'nav-link'}><span style={{ fontSize: 18, flexShrink: 0 }}>📊</span><span style={{ whiteSpace: 'nowrap' }}>Dashboard</span></Link>}
        </nav>

        <div style={{
          borderTop: '1px solid var(--border-color)', paddingTop: 16, marginTop: 16
        }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '10px 12px', borderRadius: 10,
            background: 'var(--accent-light)', marginBottom: 10
          }}>
            <div style={{
              width: 32, height: 32, borderRadius: '50%',
              background: 'var(--success-bg)', color: 'var(--success-text)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontWeight: 700, fontSize: 14, flexShrink: 0
            }}>{user?.username?.[0]?.toUpperCase()}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user?.username}</div>
              <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{user?.role}</div>
            </div>
          </div>
          <button onClick={() => setShowConfirm(true)} className="btn-logout">Sair</button>
        </div>
      </aside>


      {/* ==========================================
          CONTEÚDO PRINCIPAL
          ========================================== */}
      <main id="main-content">
        <Outlet />
      </main>


      {/* ==========================================
          BOTTOM NAV MOBILE — ITENS UM POR UM
          ========================================== */}
      <nav id="bottom-nav">
        <Link to="/pdv" className={ativoPDV ? 'bottom-link active' : 'bottom-link'}>
          <span style={{ fontSize: 20, lineHeight: 1 }}>🛒</span>
          <span style={{ whiteSpace: 'nowrap', fontSize: '10px' }}>Novo Pedido</span>
        </Link>
        <Link to="/comandas" className={ativoComandas ? 'bottom-link active' : 'bottom-link'}>
          <span style={{ fontSize: 20, lineHeight: 1 }}>📋</span>
          <span style={{ whiteSpace: 'nowrap', fontSize: '10px' }}>Comandas</span>
        </Link>
        {user?.role === 'admin' && <Link to="/contas-receber" className={ativoContasReceber ? 'bottom-link active' : 'bottom-link'}>
          <span style={{ fontSize: 20, lineHeight: 1 }}>💰</span>
          <span style={{ fontSize: '10px' }}>A Receber</span>
        </Link>}
        {user?.role === 'admin' && <Link to="/produtos" className={ativoProdutos ? 'bottom-link active' : 'bottom-link'}>
          <span style={{ fontSize: 20, lineHeight: 1 }}>📦</span>
          <span style={{ whiteSpace: 'nowrap', fontSize: '10px' }}>Produtos</span>
        </Link>}
        {user?.role === 'admin' && <Link to="/producao" className={ativoProducao ? 'bottom-link active' : 'bottom-link'}><span style={{ fontSize: 20, lineHeight: 1 }}>🧪</span><span style={{ fontSize: '10px' }}>Produção</span></Link>}
        {(user?.role === 'admin' || user?.role === 'operador' || user?.role === 'cozinha') && <Link to="/cozinha" className={ativoCozinha ? 'bottom-link active' : 'bottom-link'}><span style={{ fontSize: 20, lineHeight: 1 }}>🍳</span><span style={{ fontSize: '10px' }}>Cozinha</span></Link>}
        {user?.role === 'admin' && (
          <Link to="/usuarios" className={ativoUsuarios ? 'bottom-link active' : 'bottom-link'}>
            <span style={{ fontSize: 20, lineHeight: 1 }}>👥</span>
            <span style={{ fontSize: '10px' }}>Usuários</span>
          </Link>
        )}
        {user?.role === 'admin' && <Link to="/clientes" className={ativoClientes ? 'bottom-link active' : 'bottom-link'}>
          <span style={{ fontSize: 20, lineHeight: 1 }}>👤</span>
          <span style={{ whiteSpace: 'nowrap', fontSize: '10px' }}>Clientes</span>
        </Link>}
        {user?.role === 'admin' && <Link to="/financeiro" className={ativoFinanceiro ? 'bottom-link active' : 'bottom-link'}><span style={{ fontSize: 20, lineHeight: 1 }}>💵</span><span style={{ fontSize: '10px' }}>Financeiro</span></Link>}
        {user?.role === 'admin' && <Link to="/dashboard" className={ativoDashboard ? 'bottom-link active' : 'bottom-link'}><span style={{ fontSize: 20, lineHeight: 1 }}>📊</span><span style={{ fontSize: '10px' }}>Dashboard</span></Link>}
      </nav>


      {/* ==========================================
          MODAL DE SAÍDA
          ========================================== */}
      {showConfirm && (
        <div onClick={() => setShowConfirm(false)} style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 99999, padding: 20
        }}>
          <div onClick={e => e.stopPropagation()} style={{
            background: 'var(--bg-secondary)', borderRadius: 16, padding: 24,
            width: '100%', maxWidth: 340, textAlign: 'center',
            boxShadow: 'var(--shadow-lg)',
            color: 'var(--text-primary)'
          }}>
            <div style={{
              width: 56, height: 56, borderRadius: '50%',
              background: 'rgba(239, 68, 68, 0.1)', color: 'var(--error-bg)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 28, margin: '0 auto 16px'
            }}>⚠️</div>
            <h3 style={{ margin: '0 0 8px', fontSize: 18, color: 'var(--text-primary)' }}>Deseja realmente sair?</h3>
            <p style={{ margin: '0 0 20px', fontSize: 14, color: 'var(--text-secondary)' }}>
              Você precisará fazer login novamente para acessar o sistema.
            </p>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setShowConfirm(false)} style={{
                flex: 1, padding: '12px', background: 'var(--bg-tertiary)', color: 'var(--text-primary)',
                border: '1px solid var(--border-color)', borderRadius: 10, fontSize: 14, fontWeight: 600,
                cursor: 'pointer', fontFamily: 'inherit', minHeight: 44,
                transition: 'all 0.2s ease'
              }}>Cancelar</button>
              <button onClick={sair} style={{
                flex: 1, padding: '12px', background: 'var(--error-bg)', color: 'var(--error-text)',
                border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 700,
                cursor: 'pointer', fontFamily: 'inherit', minHeight: 44,
                transition: 'all 0.2s ease'
              }}>Sim, Sair</button>
            </div>
          </div>
        </div>
      )}


      {/* ==========================================
          CSS GLOBAL
          ========================================== */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Fraunces:opsz,wght@9..144,600;9..144,700&display=swap');
        
        * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
        body { margin: 0; }

        /* DESKTOP — BARRA LATERAL 260px */
        @media (min-width: 769px) {
          #header-mobile { display: none !important; }
          #sidebar-desktop {
            display: flex !important;
            position: fixed; top: 0; left: 0;
            width: 260px;
            height: 100vh;
            background: var(--bg-secondary);
            border-right: 1px solid var(--border-color);
            padding: 24px;
            flex-direction: column;
            z-index: 50;
          }
          #bottom-nav { display: none !important; }
          #main-content {
            margin-left: 260px !important;
            padding: 28px !important;
          }
        }

        /* MOBILE */
        @media (max-width: 768px) {
          #header-mobile {
            display: flex !important;
            align-items: center;
            justify-content: space-between;
            gap: 12px;
            position: sticky;
            top: 0;
            background: var(--bg-secondary);
            border-bottom: 1px solid var(--border-color);
            padding: 12px 16px;
            z-index: 100;
          }
          #sidebar-desktop {
            display: none !important;
            position: absolute !important;
            left: -9999px !important;
            width: 0 !important;
            height: 0 !important;
            overflow: hidden !important;
          }
          #bottom-nav {
            display: flex !important;
            position: fixed;
            bottom: 0; left: 0; right: 0;
            background: var(--bg-secondary);
            border-top: 1px solid var(--border-color);
            z-index: 9999;
            padding-bottom: env(safe-area-inset-bottom);
            padding-top: 4px;
          }
          #main-content {
            margin-left: 0 !important;
            padding: 16px 16px 100px 16px !important;
            min-height: calc(100vh - 60px);
          }
        }

        .nav-link {
          display: flex; align-items: center; gap: 12px;
          padding: 12px 14px; border-radius: 10px; margin-bottom: 4px;
          text-decoration: none; color: var(--text-secondary);
          font-weight: 500; font-size: 14px;
          border-left: 3px solid transparent;
          transition: all .2s;
        }
        .nav-link.active {
          background: var(--accent-light);
          color: var(--accent-primary); font-weight: 700;
          border-left-color: var(--accent-primary);
        }

        .btn-logout {
          width: 100%; padding: 10px;
          background: transparent; color: var(--error-bg);
          border: 1px solid rgba(239, 68, 68, 0.2);
          border-radius: 10px; cursor: 'pointer';
          font-weight: 600; font-size: 13px;
          min-height: 40px; font-family: inherit;
          transition: all 0.2s ease;
        }

        .bottom-link {
          flex: 1; display: flex; flex-direction: column;
          align-items: center; justify-content: center;
          padding: 6px 2px; text-decoration: none;
          color: var(--text-secondary);
          font-weight: 500;
          gap: 2px; min-height: 65px;
          transition: all 0.2s ease;
        }
        .bottom-link.active { 
          color: var(--accent-primary); 
          font-weight: 700; 
        }
        .bottom-link span:first-child { font-size: 20px; }

        input, select, textarea { font-size: 16px !important; }
      `}</style>
    </div>
  );
}

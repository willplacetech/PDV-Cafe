import { useContext, useState } from 'react';
import { Link, Outlet, useNavigate, useLocation } from 'react-router-dom';
import { AuthContext } from '../context/AuthContextDefinition.jsx';
import { ThemeContext } from '../context/ThemeContextDefinition.js';
import StatusConexao from './StatusConexao.jsx';

const gruposMenu = [
  {
    chave: 'atendimento',
    label: '🏪 ATENDIMENTO',
    items: [
      { label: 'Novo Pedido', icon: '🛒', to: '/pdv' },
      { label: 'Mesas / Comandas', icon: '🪑', to: '/atendimento/mesas' },
      { label: 'A Receber', icon: '💰', to: '/contas-receber', admin: true },
    ],
  },
  {
    chave: 'cadastro',
    label: '📦 CADASTRO',
    items: [
      { label: 'Produtos', icon: '📦', to: '/produtos', admin: true },
      { label: 'Mesas', icon: '🪑', to: '/cadastro/mesas', admin: true },
    ],
  },
  {
    chave: 'compras',
    label: '🧾 COMPRAS',
    items: [
      { label: 'Lançar Entrada', icon: '🧾', to: '/compras', admin: true },
      { label: 'Histórico de Compras', icon: '📚', to: '/compras', admin: true },
    ],
  },
  {
    chave: 'producao',
    label: '🧪 PRODUÇÃO',
    items: [
      { label: 'Estoque de Insumos', icon: '📦', to: '/producao', admin: true },
      { label: 'Lançar Produção', icon: '🔄', to: '/producao', admin: true },
      { label: 'Histórico de Movimentação', icon: '📜', to: '/producao', admin: true },
      { label: 'Cozinha', icon: '🍳', to: '/cozinha', roles: ['admin', 'operador', 'cozinha'] },
    ],
  },
  {
    chave: 'financeiro',
    label: '💰 FINANCEIRO',
    items: [
      { label: 'Fechamento de Caixa', icon: '💵', to: '/caixa', admin: true },
      { label: 'Dashboard', icon: '📊', to: '/dashboard', admin: true },
      { label: 'DRE / Demonstrativo', icon: '📈', to: '/financeiro', admin: true },
    ],
  },
  {
    chave: 'pessoas',
    label: '👥 PESSOAS',
    items: [
      { label: 'Clientes', icon: '👤', to: '/clientes', admin: true },
      { label: 'Usuários', icon: '👥', to: '/usuarios', admin: true },
    ],
  },
  {
    chave: 'configuracoes',
    label: '⚙️ CONFIGURAÇÕES',
    items: [
      { label: 'Impressoras', icon: '🖨️', to: '/ajustes/impressoras', admin: true },
    ],
  },
];

const pageIcons = {
  '/pdv': { icon: '🛒', title: 'Atendimento' },
  '/produtos': { icon: '📦', title: 'Produtos' },
  '/clientes': { icon: '👤', title: 'Clientes' },
  '/comandas': { icon: '📋', title: 'Comandas' },
  '/cozinha': { icon: '🍳', title: 'Cozinha' },
  '/contas-receber': { icon: '💰', title: 'A Receber' },
  '/usuarios': { icon: '👥', title: 'Usuários' },
  '/dashboard': { icon: '📊', title: 'Dashboard' },
  '/producao/fichas': { icon: '📋', title: 'Ficha técnica' },
  '/producao': { icon: '🧪', title: 'Produção' },
  '/compras': { icon: '🧾', title: 'Compras' },
  '/financeiro': { icon: '💵', title: 'Financeiro' },
  '/ajustes/impressoras': { icon: '🖨️', title: 'Impressoras' },
};

export default function Layout() {
  const { user, logout } = useContext(AuthContext);
  const { isDark, toggleTheme } = useContext(ThemeContext);
  const navigate = useNavigate();
  const location = useLocation();
  const [showConfirm, setShowConfirm] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [gruposAbertos, setGruposAbertos] = useState({ atendimento: true });

  const sair = () => { logout(); navigate('/login'); };

  const toggleGrupo = (chave) => {
    setGruposAbertos((prev) => {
      const novo = {};
      Object.keys(prev).forEach((k) => { if (k !== chave) novo[k] = false; });
      novo[chave] = !prev[chave];
      return novo;
    });
  };

  const pathAtivo = location.pathname;
  const grupoAtivo = gruposMenu.find((g) => g.items.some((item) => pathAtivo.startsWith(item.to)));

  const toggleMobileMenu = (open) => {
    setMobileMenuOpen(open);
    if (open) {
      const activeKey = grupoAtivo?.chave;
      const novo = {};
      gruposMenu.forEach((g) => {
        if (g.chave === activeKey) novo[g.chave] = true;
        else novo[g.chave] = false;
      });
      setGruposAbertos(novo);
    }
  };

  const pageInfo = Object.entries(pageIcons).find(([path]) => pathAtivo.startsWith(path));
  const iconePagina = pageInfo ? pageInfo[1].icon : '';
  const tituloPagina = pageInfo ? pageInfo[1].title : 'Atendimento';

  const visibleGroups = () => {
    const userRole = user?.role;
    return gruposMenu.filter((grupo) => {
      if (grupo.chave === 'atendimento') {
        return grupo.items.some((item) => !item.admin || userRole === 'admin');
      }
      if (grupo.admin) return userRole === 'admin';
      return grupo.items.some((item) => {
        if (item.admin) return userRole === 'admin';
        if (item.roles) return item.roles.includes(userRole);
        return true;
      });
    });
  };

  const renderGrupo = (grupo, isMobile) => {
    const isOpen = gruposAbertos[grupo.chave] || grupo.sempreVisivel;
    const userRole = user?.role;
    const visibleItems = grupo.items.filter((item) => {
      if (item.admin) return userRole === 'admin';
      if (item.roles) return item.roles.includes(userRole);
      return true;
    });
    if (visibleItems.length === 0) return null;

    return (
      <div className="nav-group-container" key={grupo.chave}>
        <button
          type="button"
          className={'nav-group-header ' + (isOpen ? 'open' : '')}
          onClick={() => toggleGrupo(grupo.chave)}
          aria-expanded={isOpen}
        >
          <span className="nav-group-label">{grupo.label}</span>
          <span className="nav-group-arrow">{isOpen ? '▼' : '▶'}</span>
        </button>
        {isOpen && (
          <div className={'nav-group-content ' + (isOpen ? 'open' : '')}>
            {visibleItems.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                className={pathAtivo.startsWith(item.to) ? 'nav-link active' : 'nav-link'}
                onClick={() => {
                  if (isMobile) toggleMobileMenu(false);
                  toggleGrupo(grupo.chave);
                }}
              >
                <span className="nav-link-icon">{item.icon}</span>
                <span className="nav-link-text">{item.label}</span>
              </Link>
            ))}
          </div>
        )}
      </div>
    );
  };

  const groups = visibleGroups();

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-primary)', fontFamily: 'var(--font-body)', color: 'var(--text-primary)', transition: 'background-color 0.3s ease, color 0.3s ease' }}>

      {/* ==========================================
            HEADER MOBILE
            ========================================== */}
      <header id="header-mobile">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
          <button
            type="button"
            className="hamburger"
            onClick={() => toggleMobileMenu(true)}
            aria-label="Abrir menu"
            aria-expanded={mobileMenuOpen}
          >
            &#9776;
          </button>
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
        <StatusConexao compacto />
      </header>
      <div className="connection-status-desktop">
        <StatusConexao compacto />
      </div>


      {/* ==========================================
            SIDEBAR DESKTOP - 260px
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

        <nav className="sidebar-nav">
          {groups.map((grupo) => renderGrupo(grupo, false))}
        </nav>

        <div style={{
          borderTop: '1px solid var(--border-color)', paddingTop: 16, marginTop: 'auto'
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
            OVERLAY MOBILE - MENU HAMBURGUER
            ========================================== */}
      {mobileMenuOpen && (
        <div className="mobile-menu-backdrop" onClick={() => toggleMobileMenu(false)}>
          <div className="mobile-menu-panel" onClick={(e) => e.stopPropagation()}>
            <div className="mobile-menu-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <img src="/Abraco1.png" alt="Sabor de Abraço" style={{ width: 40, height: 40, borderRadius: '50%', objectFit: 'cover', border: '1px solid var(--brand-gold)' }} />
                <div>
                  <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 15, color: 'var(--brand-brown)' }}>Sabor de Abraço</div>
                  <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Cafeteria e confeitaria</div>
                </div>
              </div>
              <button
                type="button"
                className="mobile-menu-close"
                onClick={() => toggleMobileMenu(false)}
                aria-label="Fechar menu"
              >
                x
              </button>
            </div>

            <nav className="mobile-menu-nav">
              {groups.map((grupo) => renderGrupo(grupo, true))}
            </nav>

            <div className="mobile-menu-footer">
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
              <button onClick={() => { setShowConfirm(true); toggleMobileMenu(false); }} className="btn-logout">Sair</button>
            </div>
          </div>
        </div>
      )}


      {/* ==========================================
            CONTEUDO PRINCIPAL
            ========================================== */}
      <main id="main-content">
        <Outlet />
      </main>


      {/* ==========================================
            MODAL DE SAIDA
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
            }}></div>
            <h3 style={{ margin: '0 0 8px', fontSize: 18, color: 'var(--text-primary)' }}>Deseja realmente sair?</h3>
            <p style={{ margin: '0 0 20px', fontSize: 14, color: 'var(--text-secondary)' }}>
              Voce precisara fazer login novamente para acessar o sistema.
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

        /* DESKTOP - BARRA LATERAL 260px */
        @media (min-width: 769px) {
          #header-mobile { display: none !important; }
          .connection-status-desktop {
            display: block;
            position: fixed;
            top: 12px;
            right: 16px;
            z-index: 200;
            width: min(400px, calc(100vw - 292px));
          }
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
          #main-content {
            margin-left: 260px !important;
            padding: 28px !important;
          }
        }

        /* MOBILE */
        @media (max-width: 768px) {
          .connection-status-desktop { display: none; }
          #header-mobile {
            display: flex !important;
            flex-wrap: wrap;
            align-items: center;
            justify-content: space-between;
            gap: 12px;
            position: sticky;
            top: 0;
            background: var(--bg-secondary);
            border-bottom: 1px solid var(--border-color);
            padding: calc(12px + var(--safe-top)) 16px 12px 16px;
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
          #main-content {
            margin-left: 0 !important;
            padding: calc(16px + var(--safe-top)) 16px calc(80px + var(--safe-bottom)) 16px !important;
            min-height: calc(100vh - 60px);
          }
        }

        @media (display-mode: standalone) {
          #header-mobile {
            padding-top: calc(18px + var(--safe-top)) !important;
          }
          #main-content {
            padding-top: calc(20px + var(--safe-top)) !important;
          }
        }

        /* HAMBURGER BUTTON (mobile) */
        .hamburger {
          display: none;
          background: transparent;
          color: var(--text-primary);
          border: 1px solid var(--border-color);
          border-radius: 10px;
          width: 44px;
          height: 44px;
          font-size: 22px;
          cursor: pointer;
          align-items: center;
          justify-content: center;
          transition: all 0.2s ease;
          flexShrink: 0;
        }
        @media (max-width: 768px) {
          .hamburger { display: flex !important; }
        }

        /* MOBILE MENU OVERLAY */
        .mobile-menu-backdrop {
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.5);
          z-index: 500;
          display: flex;
          padding-left: 0;
        }
        .mobile-menu-panel {
          position: fixed;
          top: 0;
          left: 0;
          width: 280px;
          max-width: 85vw;
          height: 100vh;
          background: var(--bg-secondary);
          border-right: 1px solid var(--border-color);
          display: flex;
          flex-direction: column;
          overflow: hidden;
          z-index: 550;
        }
        .mobile-menu-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 16px;
          border-bottom: 1px solid var(--border-color);
        }
        .mobile-menu-close {
          width: 36px;
          height: 36px;
          border: 1px solid var(--border-color);
          border-radius: 8px;
          background: transparent;
          color: var(--text-primary);
          font-size: 18px;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .mobile-menu-nav {
          flex: 1;
          overflow-y: auto;
          padding: 12px 0;
        }
        .mobile-menu-footer {
          border-top: 1px solid var(--border-color);
          padding: 16px;
        }

        /* SIDEBAR NAV LIST */
        .sidebar-nav, .mobile-menu-nav {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        /* NAV LINKS - touch friendly */
        .nav-link {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 12px 14px;
          border-radius: 10px;
          margin-bottom: 2px;
          text-decoration: none;
          color: var(--text-secondary);
          font-weight: 500;
          font-size: 14px;
          border-left: 3px solid transparent;
          min-height: 48px;
          transition: all 0.2s;
        }
        .nav-link:hover,
        .nav-link:focus-visible {
          background: var(--accent-light);
          color: var(--accent-primary);
          outline: none;
        }
        .nav-link-icon {
          font-size: 20px;
          flex-shrink: 0;
          line-height: 1;
        }
        .nav-link-text {
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .nav-link.active {
          background: var(--accent-light);
          color: var(--accent-primary);
          font-weight: 700;
          border-left-color: var(--accent-primary);
        }

        /* COLLAPSIBLE GROUPS */
        .nav-group-container { margin: 8px 0; }
        .nav-group-label-static {
          display: flex;
          align-items: center;
          gap: 8px;
          width: 100%;
          padding: 10px 14px;
          color: var(--text-secondary);
          font-size: 11px;
          font-weight: 800;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          cursor: default;
        }
        .nav-group-header {
          width: 100%;
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 10px 14px;
          background: transparent;
          border: none;
          color: var(--text-secondary);
          font-size: 11px;
          font-weight: 800;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          cursor: pointer;
          min-height: 40px;
          transition: all 0.2s;
        }
        .nav-group-header:hover {
          background: var(--accent-light);
          color: var(--accent-primary);
        }
        .nav-group-header:focus-visible {
          outline: 2px solid var(--accent-primary);
          outline-offset: -2px;
        }
        .nav-group-header.open {
          color: var(--accent-primary);
        }
        .nav-group-arrow {
          font-size: 13px;
          transition: transform 0.2s;
        }
        .nav-group-header.open .nav-group-arrow {
          transform: none;
        }
        .nav-group-content {
          overflow: hidden;
          max-height: 0;
          transition: max-height 0.3s ease;
        }
        .nav-group-content.open {
          max-height: 500px;
        }
        .nav-group-content .nav-link {
          padding: 10px 14px 10px 28px;
          font-size: 13px;
          min-height: 44px;
        }

        /* LOGOUT BUTTON */
        .btn-logout {
          width: 100%;
          padding: 12px;
          background: transparent;
          color: var(--error-bg);
          border: 1px solid rgba(239, 68, 68, 0.2);
          border-radius: 10px;
          cursor: pointer;
          font-weight: 600;
          font-size: 13px;
          min-height: 48px;
          font-family: inherit;
          transition: all 0.2s ease;
        }
        .btn-logout:hover {
          background: rgba(239, 68, 68, 0.05);
        }

        input, select, textarea { font-size: 16px !important; }
      `}</style>
    </div>
  );
}

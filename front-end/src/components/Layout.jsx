import { useCallback, useContext, useEffect, useState } from 'react';
import { Link, Outlet, useNavigate, useLocation } from 'react-router-dom';
import { AuthContext } from '../context/AuthContextDefinition.jsx';
import { ThemeContext } from '../context/ThemeContextDefinition.js';
import StatusConexao from './StatusConexao.jsx';
import api from '../services/api.jsx';
import { APP_GIT_HASH } from '../services/appVersion.js';
import NovidadesModal from './NovidadesModal.jsx';
import { branding } from '../config/branding.js';

const gruposMenu = [
  {
    chave: 'atendimento',
    label: '🏪 ATENDIMENTO',
    items: [
      { label: 'PDV · Nova venda', icon: '🛒', to: '/pdv' },
      { label: 'Entregas', icon: '🛵', to: '/entregas', roles: ['admin', 'operador'], badge: true },
      { label: 'Mesas / Comandas', icon: '🪑', to: '/comandas', badge: 'comandas' },
      { label: 'A Receber', icon: '💰', to: '/contas-receber', admin: true },
    ],
  },
  {
    chave: 'cadastro',
    label: '📦 CADASTRO',
    items: [
      { label: 'Produtos', icon: '📦', to: '/produtos', roles: ['admin', 'gerente'] },
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
      { label: 'Estoque de Insumos', icon: '📦', to: '/producao', roles: ['admin', 'gerente'] },
      { label: 'Lançar Produção', icon: '🔄', to: '/producao', admin: true },
      { label: 'Histórico de Movimentação', icon: '📜', to: '/producao', admin: true },
      { label: 'Cozinha', icon: '🍳', to: '/cozinha', roles: ['admin', 'operador', 'cozinha'] },
    ],
  },
  {
    chave: 'financeiro',
    label: '💰 GESTÃO',
    items: [
      { label: 'Dashboard', icon: '📊', to: '/dashboard', admin: true },
      { label: 'Fechamento de Caixa', icon: '💵', to: '/caixa', roles: ['admin', 'gerente'] },
      { label: 'DRE / Demonstrativo', icon: '📈', to: '/financeiro', admin: true },
      { label: 'Auditoria', icon: '🧾', to: '/auditoria', admin: true },
    ],
  },
  {
    chave: 'pessoas',
    label: '👥 PESSOAS',
    items: [
      { label: 'Clientes', icon: '👤', to: '/clientes', roles: ['admin', 'gerente'] },
      { label: 'Usuários', icon: '👥', to: '/usuarios', admin: true },
    ],
  },
  {
    chave: 'configuracoes',
    label: '⚙️ CONFIGURAÇÕES',
    items: [
      { label: 'Autorização de gerente', icon: '🔐', to: '/configuracoes', admin: true },
      { label: 'Impressoras', icon: '🖨️', to: '/ajustes/impressoras', admin: true },
      { label: 'Pagamentos', icon: '💳', to: '/configuracoes/pagamentos', admin: true },
    ],
  },
];

const pageIcons = {
  '/pdv': { icon: '🛒', title: 'Atendimento' },
  '/entregas': { icon: '🛵', title: 'Entregas' },
  '/produtos': { icon: '📦', title: 'Produtos' },
  '/clientes': { icon: '👤', title: 'Clientes' },
  '/comandas': { icon: '🪑', title: 'Mesas / Comandas' },
  '/cozinha': { icon: '🍳', title: 'Cozinha' },
  '/contas-receber': { icon: '💰', title: 'A Receber' },
  '/usuarios': { icon: '👥', title: 'Usuários' },
  '/dashboard': { icon: '📊', title: 'Dashboard' },
  '/producao/fichas': { icon: '📋', title: 'Ficha técnica' },
  '/producao': { icon: '🧪', title: 'Produção' },
  '/compras': { icon: '🧾', title: 'Compras' },
  '/financeiro': { icon: '💵', title: 'Financeiro' },
  '/auditoria': { icon: '🧾', title: 'Auditoria' },
  '/ajustes/impressoras': { icon: '🖨️', title: 'Impressoras' },
  '/configuracoes/pagamentos': { icon: '💳', title: 'Pagamentos' },
  '/configuracoes': { icon: '🔐', title: 'Autorização de gerente' },
};

export default function Layout({ children }) {
  const { user, logout } = useContext(AuthContext);
  const { isDark, toggleTheme } = useContext(ThemeContext);
  const navigate = useNavigate();
  const location = useLocation();
  const [showConfirm, setShowConfirm] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [gruposAbertos, setGruposAbertos] = useState({ atendimento: true });
  const [entregasPendentes, setEntregasPendentes] = useState(0);
  const [comandasAbertas, setComandasAbertas] = useState(0);

  const userRole = user?.role;
  const userTenantId = user?.tenantId;

  const carregarBadgeEntregas = useCallback(async () => {
    if (!userTenantId || !['admin', 'operador'].includes(userRole)) {
      setEntregasPendentes(0);
      return;
    }
    try {
      const { data } = await api.get('/entregas/estatisticas', { pdvSilenciosa: true });
      setEntregasPendentes(Number(data.prontos || 0) + Number(data.despachados || 0));
    } catch (error) {
      console.warn('[Entregas] Não foi possível atualizar o indicador do menu.', error.response?.status || error.code || error.message);
    }
  }, [userRole, userTenantId]);

  useEffect(() => {
    const inicio = window.setTimeout(() => { void carregarBadgeEntregas(); }, 0);
    const polling = window.setInterval(() => { void carregarBadgeEntregas(); }, 15000);
    return () => { window.clearTimeout(inicio); window.clearInterval(polling); };
  }, [carregarBadgeEntregas]);

  useEffect(() => {
    if (!user?.tenantId) {
      const timer = window.setTimeout(() => setComandasAbertas(0), 0);
      return () => window.clearTimeout(timer);
    }
    let ativo = true;
    const carregarComandasAbertas = async () => {
      try {
        const { data } = await api.get('/comandas?status=aberta', { pdvSilenciosa: true });
        if (ativo) setComandasAbertas(Array.isArray(data) ? data.length : 0);
      } catch (error) {
        console.warn('[Comandas] Não foi possível atualizar o indicador do menu.', error.response?.status || error.code || error.message);
      }
    };
    void carregarComandasAbertas();
    const polling = window.setInterval(() => { void carregarComandasAbertas(); }, 30000);
    return () => { ativo = false; window.clearInterval(polling); };
  }, [user?.tenantId]);

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
                className={pathAtivo.startsWith(item.to.split('?')[0]) ? 'nav-link active' : 'nav-link'}
                onClick={() => {
                  if (isMobile) toggleMobileMenu(false);
                  toggleGrupo(grupo.chave);
                }}
              >
                <span className="nav-link-icon">{item.icon}</span>
                <span className="nav-link-text">{item.label}</span>
                {item.badge === true && entregasPendentes > 0 && <span className="nav-link-badge" aria-label={`${entregasPendentes} entregas pendentes`}>{entregasPendentes}</span>}
                {item.badge === 'comandas' && comandasAbertas > 0 && <span className="nav-link-badge" aria-label={`${comandasAbertas} comandas abertas`}>{comandasAbertas}</span>}
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
      <NovidadesModal />
      <header id="header-mobile">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
          <button type="button" className="hamburger" onClick={() => toggleMobileMenu(true)} aria-label="Abrir menu" aria-expanded={mobileMenuOpen}>
            &#9776;
          </button>
          <span style={{ fontSize: 22, lineHeight: 1 }}>{iconePagina}</span>
          <h1 style={{ fontSize: 17, fontWeight: 700, margin: 0, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{tituloPagina}</h1>
        </div>
        <div style={{ display: 'flex', borderRadius: 10, overflow: 'hidden', border: '1px solid var(--border-color)', height: 38, flexShrink: 0 }}>
          <button onClick={toggleTheme} style={{ background: 'transparent', color: 'var(--text-primary)', border: '1px solid var(--border-color)', borderRight: '1px solid var(--border-color)', padding: '0 10px', fontWeight: 700, fontSize: 16, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 4 }} title={isDark ? 'Modo claro' : 'Modo escuro'}>
            {isDark ? '☀️' : '🌙'}
          </button>
          <div style={{ background: 'var(--success-bg)', color: 'var(--success-text)', display: 'flex', alignItems: 'center', gap: 6, padding: '0 10px', fontWeight: 700, fontSize: 13 }}>
            <div style={{ width: 22, height: 22, borderRadius: '50%', background: 'rgba(255,255,255,.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, flexShrink: 0 }}>{user?.username?.[0]?.toUpperCase()}</div>
            <span style={{ maxWidth: 70, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user?.username}</span>
          </div>
          <button onClick={() => setShowConfirm(true)} style={{ background: 'var(--error-bg)', color: 'var(--error-text)', border: 'none', borderLeft: '1px solid rgba(255,255,255,.2)', padding: '0 14px', fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>Sair</button>
        </div>
        <StatusConexao compacto />
      </header>
      <div className="connection-status-desktop"><StatusConexao compacto /></div>

      <aside id="sidebar-desktop">
        <Link to={user?.role === 'admin' ? '/dashboard' : '/pdv'} aria-label="Página inicial" style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 40, textDecoration: 'none' }}>
          <img src={branding.logoUrl} alt={branding.name} style={{ width: 48, height: 48, borderRadius: 12, objectFit: 'contain', border: '1px solid var(--border-color)' }} />
          <div>
            <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 17, color: 'var(--text-primary)' }}>{branding.name}</div>
            <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{branding.tagline}</div>
          </div>
        </Link>
        <button onClick={toggleTheme} style={{ width: '100%', padding: '10px', background: 'var(--bg-tertiary)', color: 'var(--text-primary)', border: '1px solid var(--border-color)', borderRadius: '10px', cursor: 'pointer', fontWeight: '600', fontSize: '13px', minHeight: '40px', fontFamily: 'inherit', marginBottom: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }} title={isDark ? 'Modo claro' : 'Modo escuro'}>
          {isDark ? '☀️ Modo Claro' : '🌙 Modo Escuro'}
        </button>
        <nav className="sidebar-nav">{groups.map((grupo) => renderGrupo(grupo, false))}</nav>
        <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: 16, marginTop: 'auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 10, background: 'var(--accent-light)', marginBottom: 10 }}>
            <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--success-bg)', color: 'var(--success-text)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 14, flexShrink: 0 }}>{user?.username?.[0]?.toUpperCase()}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user?.username}</div>
              <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{user?.role}</div>
            </div>
          </div>
          <button onClick={() => setShowConfirm(true)} className="btn-logout">Sair</button>
        </div>
      </aside>

      {mobileMenuOpen && (
        <div className="mobile-menu-backdrop" onClick={() => toggleMobileMenu(false)}>
          <div className="mobile-menu-panel" onClick={(e) => e.stopPropagation()}>
            <div className="mobile-menu-header">
              <Link to={user?.role === 'admin' ? '/dashboard' : '/pdv'} onClick={() => toggleMobileMenu(false)} aria-label="Página inicial" style={{ display: 'flex', alignItems: 'center', gap: 12, textDecoration: 'none' }}>
                <img src={branding.logoUrl} alt={branding.name} style={{ width: 40, height: 40, borderRadius: 10, objectFit: 'contain', border: '1px solid var(--border-color)' }} />
                <div>
                  <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 15, color: 'var(--text-primary)' }}>{branding.name}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{branding.tagline}</div>
                </div>
              </Link>
              <button type="button" className="mobile-menu-close" onClick={() => toggleMobileMenu(false)} aria-label="Fechar menu">x</button>
            </div>
            <nav className="mobile-menu-nav">{groups.map((grupo) => renderGrupo(grupo, true))}</nav>
            <div className="mobile-menu-footer">
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 10, background: 'var(--accent-light)', marginBottom: 10 }}>
                <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--success-bg)', color: 'var(--success-text)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 14, flexShrink: 0 }}>{user?.username?.[0]?.toUpperCase()}</div>
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

      <main id="main-content">{children || <Outlet />}</main>

      {showConfirm && (
        <div onClick={() => setShowConfirm(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: 'var(--bg-secondary)', borderRadius: 16, padding: 28, width: '100%', maxWidth: 360, textAlign: 'center', border: '1px solid var(--border-color)', boxShadow: 'var(--shadow-lg)' }}>
            <img src={branding.logoUrl} alt={branding.name} style={{ display: 'block', width: 64, height: 64, borderRadius: 14, objectFit: 'contain', margin: '0 auto 16px', border: '1px solid var(--border-color)' }} />
            <h3 style={{ margin: '0 0 8px', fontSize: 18, color: 'var(--text-primary)' }}>Deseja realmente sair?</h3>
            <p style={{ margin: '0 0 20px', fontSize: 14, color: 'var(--text-secondary)' }}>Você precisará entrar novamente para continuar.</p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
              <button type="button" onClick={() => setShowConfirm(false)} style={{ padding: '10px 18px', borderRadius: 10, border: '1px solid var(--border-color)', background: 'var(--bg-tertiary)', color: 'var(--text-primary)', fontWeight: 600, cursor: 'pointer' }}>Cancelar</button>
              <button type="button" onClick={sair} style={{ padding: '10px 18px', borderRadius: 10, border: 'none', background: 'var(--error-bg)', color: 'var(--error-text)', fontWeight: 700, cursor: 'pointer' }}>Sair</button>
            </div>
          </div>
        </div>
      )}

      <footer style={{ padding: '8px 16px', fontSize: 11, color: 'var(--text-tertiary)', textAlign: 'center' }}>
        <span>{branding.name} · v{APP_GIT_HASH}</span>
      </footer>

      <style>{`
        #sidebar-desktop { position: fixed; top: 0; left: 0; width: 260px; height: 100vh; background: var(--bg-secondary); border-right: 1px solid var(--border-color); padding: 24px 16px; display: flex; flex-direction: column; z-index: 40; overflow-y: auto; }
        #header-mobile { display: none; }
        #main-content { margin-left: 260px; min-height: 100vh; padding: 24px; }
        .connection-status-desktop { position: fixed; top: 12px; right: 16px; z-index: 50; }
        .nav-group-header { width: 100%; display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 10px 12px; margin-bottom: 4px; background: transparent; border: none; border-radius: 8px; color: var(--text-secondary); font-size: 11px; font-weight: 700; letter-spacing: 0.04em; cursor: pointer; font-family: inherit; text-align: left; }
        .nav-group-header:hover, .nav-group-header.open { background: var(--bg-tertiary); color: var(--text-primary); }
        .nav-link { display: flex; align-items: center; gap: 10px; padding: 10px 12px; margin-bottom: 2px; border-radius: 8px; color: var(--text-primary); text-decoration: none; font-size: 13px; font-weight: 500; }
        .nav-link:hover { background: var(--bg-tertiary); }
        .nav-link.active { background: var(--accent-light); color: var(--accent-primary); font-weight: 700; }
        .nav-link-badge { margin-left: auto; min-width: 20px; height: 20px; padding: 0 6px; border-radius: 999px; background: var(--error-bg); color: #fff; font-size: 11px; font-weight: 700; display: inline-flex; align-items: center; justify-content: center; }
        .btn-logout { width: 100%; padding: 10px; border-radius: 10px; border: 1px solid var(--error-border, var(--border-color)); background: transparent; color: var(--error-bg); font-weight: 700; cursor: pointer; font-family: inherit; }
        .btn-logout:hover { background: rgba(176, 74, 58, 0.08); }
        .mobile-menu-backdrop { display: none; }
        @media (max-width: 900px) {
          #sidebar-desktop { display: none; }
          #header-mobile { display: flex; align-items: center; gap: 10px; position: sticky; top: 0; z-index: 30; padding: 10px 12px; background: var(--bg-secondary); border-bottom: 1px solid var(--border-color); }
          #main-content { margin-left: 0; padding: 16px; }
          .connection-status-desktop { display: none; }
          .hamburger { background: transparent; border: 1px solid var(--border-color); border-radius: 8px; width: 40px; height: 40px; font-size: 20px; cursor: pointer; color: var(--text-primary); }
          .mobile-menu-backdrop { display: block; position: fixed; inset: 0; background: rgba(0,0,0,.45); z-index: 60; }
          .mobile-menu-panel { width: min(320px, 88vw); height: 100%; background: var(--bg-secondary); padding: 16px; display: flex; flex-direction: column; overflow-y: auto; }
          .mobile-menu-header { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 16px; }
          .mobile-menu-close { background: transparent; border: 1px solid var(--border-color); border-radius: 8px; width: 36px; height: 36px; cursor: pointer; color: var(--text-primary); }
          .mobile-menu-nav { flex: 1; }
          .mobile-menu-footer { margin-top: auto; padding-top: 16px; border-top: 1px solid var(--border-color); }
        }
      `}</style>
    </div>
  );
}

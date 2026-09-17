import { NavLink } from 'react-router-dom';

const areas = {
  dashboard: [['/dashboard', 'Dashboard'], ['/financeiro', 'Financeiro']],
  pessoas: [['/clientes', 'Clientes'], ['/usuarios', 'Usuários']],
};

export default function AreaTabs({ area }) {
  return <>
    <nav className="area-tabs" aria-label={`Navegação de ${area}`}>
      {(areas[area] || []).map(([to, label]) => <NavLink key={to} to={to} className={({ isActive }) => isActive ? 'active' : ''}>{label}</NavLink>)}
    </nav>
    <style>{`.area-tabs{display:flex;gap:6px;overflow-x:auto;margin:0 0 16px;padding-bottom:2px;border-bottom:1px solid var(--border-color);scrollbar-width:none}.area-tabs::-webkit-scrollbar{display:none}.area-tabs a{padding:9px 13px;border-bottom:2px solid transparent;color:var(--text-secondary);font-size:12px;font-weight:800;text-decoration:none;white-space:nowrap}.area-tabs a.active{border-color:var(--accent-primary);color:var(--accent-primary)}@media(max-width:560px){.area-tabs{margin-right:-4px}.area-tabs a{padding-inline:11px;font-size:11px}.quantity-discount-row{grid-template-columns:1fr 1fr!important}.quantity-discount-row button{grid-column:1/-1;width:100%}}`}</style>
  </>;
}

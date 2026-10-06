import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { lerSessao, salvarSessao, restaurarSessao, sairSessao, deliveryApi, courierApi, erroDelivery } from '../services/deliveryApi.js';
import '../styles/delivery.css';
import { runSessionLogin } from '../services/accessSession.js';

export default function DeliveryPortal({ courier = false, plataforma = false, children }) {
  const navigate = useNavigate();
  const [sessao, setSessao] = useState(() => lerSessao(courier));
  const [erro, setErro] = useState('');
  const [ocupado, setOcupado] = useState(false);
  useEffect(() => {
    let active = true;
    const change = event => { if (active && event.detail.scope === (courier ? 'courier' : 'delivery')) setSessao(event.detail.user ? { user: event.detail.user } : null); };
    const restore = () => restaurarSessao(courier).then(data => { if (active) setSessao(data); }).catch(() => {});
    window.addEventListener('session:change', change);
    window.addEventListener('online', restore);
    restore();
    return () => { active = false; window.removeEventListener('session:change', change); window.removeEventListener('online', restore); };
  }, [courier]);
  const role = courier ? 'entregador' : plataforma ? 'admin_plataforma' : 'tenant_admin';
  const autenticado = sessao?.user?.role === role;
  const login = async event => {
    event.preventDefault(); setOcupado(true); setErro('');
    const form = new FormData(event.currentTarget);
    try {
      const { data } = await runSessionLogin(courier ? 'courier' : 'delivery', () => (courier ? courierApi : deliveryApi).post(courier ? '/entregador/login' : '/delivery/login', courier ? { telefone: form.get('identificacao'), senha: form.get('senha') } : { email: form.get('identificacao'), senha: form.get('senha') }));
      setSessao(salvarSessao(data, courier));
      if (!courier) navigate(data.user.role === 'admin_plataforma' ? '/plataforma' : '/admin', { replace: true });
    } catch (error) { setErro(erroDelivery(error)); }
    finally { setOcupado(false); }
  };
  const sair = () => { sairSessao(courier); setSessao(null); };
  return <div className={`delivery-app ${courier ? 'delivery-courier' : ''}`}>
    <header className="delivery-header"><Link to={courier ? '/entregador' : plataforma ? '/plataforma' : '/admin'} className="delivery-brand">Delivery<span>Link</span></Link><span>{courier ? 'Entregador' : plataforma ? 'Plataforma' : 'Seu comércio'}</span>{autenticado && <button className="delivery-secondary" onClick={sair}>Sair</button>}</header>
    <main className="delivery-main">
      {!autenticado ? <form onSubmit={login} className="delivery-card delivery-login">
        <p className="delivery-eyebrow">ENTREGAS LOCAIS, MAIS PERTO</p><h1>{courier ? 'Pronto para sair?' : 'Bem-vindo ao DeliveryLink'}</h1><p>Acompanhe cada entrega, do balcão ao destino.</p>
        <label>{courier ? 'Telefone' : 'E-mail'}<input name="identificacao" type={courier ? 'tel' : 'email'} autoComplete="username" required /></label>
        <label>Senha<input name="senha" type="password" autoComplete="current-password" required /></label>
        {erro && <p role="alert" className="delivery-error">{erro}</p>}
        <button disabled={ocupado}>{ocupado ? 'Entrando…' : 'Entrar'}</button>
        <nav><Link to="/admin">Comércio</Link><Link to="/entregador">Entregador</Link><Link to="/login">PDV</Link></nav>
      </form> : children}
    </main>
  </div>;
}

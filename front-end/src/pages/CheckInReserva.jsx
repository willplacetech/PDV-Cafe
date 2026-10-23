import { useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { fazerCheckInReserva } from '../services/reservasApi.js';
import { getBranding } from '../config/branding.js';
import './Reserva.css';

export default function CheckInReserva() {
  const { codigo: codigoInicial = '' } = useParams();
  const [searchParams] = useSearchParams();
  const [codigo, setCodigo] = useState(codigoInicial.toUpperCase());
  const [mesaToken, setMesaToken] = useState(searchParams.get('mesaToken') || '');
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState(false);
  const branding = getBranding();
  const navigate = useNavigate();

  const submit = async (event) => {
    event.preventDefault();
    setErro('');
    setEnviando(true);
    try {
      const response = await fazerCheckInReserva(codigo.trim(), mesaToken.trim());
      navigate(response.redirect || `/cardapio/${response.mesa?.token || mesaToken.trim()}`, { replace: true });
    } catch (error) {
      setErro(error.response?.data?.msg || 'Não foi possível realizar o check-in.');
    } finally {
      setEnviando(false);
    }
  };

  return (
    <main className="reserva-page" style={{ '--reserva-accent': branding.themeColor }}>
      <form className="reserva-card" onSubmit={submit}>
        <Link className="reserva-back" to="/cardapio">← Voltar ao cardápio</Link>
        <p className="reserva-eyebrow">{branding.name}</p>
        <h1>Check-in da reserva</h1>
        <p>Informe o código da reserva e leia o QR Code da mesa para abrir sua comanda.</p>
        <div className="reserva-grid">
          <label>Código da reserva<input value={codigo} onChange={(event) => setCodigo(event.target.value.toUpperCase())} minLength="4" maxLength="32" required autoFocus /></label>
          <label>Token da mesa<input value={mesaToken} onChange={(event) => setMesaToken(event.target.value)} required /></label>
        </div>
        {erro && <p className="reserva-error" role="alert">{erro}</p>}
        <button className="reserva-submit" type="submit" disabled={enviando}>{enviando ? 'Validando…' : 'Fazer check-in'}</button>
      </form>
    </main>
  );
}

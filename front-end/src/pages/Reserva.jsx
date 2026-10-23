import { useState } from 'react';
import { Link } from 'react-router-dom';
import { criarReserva } from '../services/reservasApi.js';
import { getBranding } from '../config/branding.js';
import './Reserva.css';

const initialState = { data: '', horario: '', pessoas: 2, nome: '', telefone: '', observacao: '' };

export default function Reserva() {
  const [form, setForm] = useState(initialState);
  const [reserva, setReserva] = useState(null);
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState(false);
  const branding = getBranding();
  const update = (event) => setForm((current) => ({ ...current, [event.target.name]: event.target.value }));
  const submit = async (event) => {
    event.preventDefault(); setErro(''); setEnviando(true);
    try { setReserva((await criarReserva({ ...form, pessoas: Number(form.pessoas) })).reserva); }
    catch (error) { setErro(error.response?.data?.msg || 'Não foi possível criar a reserva. Tente novamente.'); }
    finally { setEnviando(false); }
  };
  if (reserva) return <main className="reserva-page" style={{ '--reserva-accent': branding.themeColor }}><section className="reserva-card" role="status"><span className="reserva-success" aria-hidden="true">✓</span><p className="reserva-eyebrow">Reserva recebida</p><h1>Está quase tudo pronto!</h1><p>Guarde o código abaixo para consultar ou cancelar sua reserva.</p><strong className="reserva-code">{reserva.codigo}</strong><dl className="reserva-summary"><div><dt>Data</dt><dd>{reserva.data}</dd></div><div><dt>Horário</dt><dd>{reserva.horario}</dd></div><div><dt>Pessoas</dt><dd>{reserva.pessoas}</dd></div></dl><Link className="reserva-link" to="/cardapio">Voltar ao cardápio</Link></section></main>;
  return <main className="reserva-page" style={{ '--reserva-accent': branding.themeColor }}><form className="reserva-card" onSubmit={submit}><Link className="reserva-back" to="/cardapio">← Voltar ao cardápio</Link><p className="reserva-eyebrow">{branding.name}</p><h1>Reserve sua mesa</h1><p>Informe os dados da sua visita. A equipe confirmará a reserva.</p><div className="reserva-grid"><label>Data<input name="data" type="date" value={form.data} onChange={update} required /></label><label>Horário<input name="horario" type="time" value={form.horario} onChange={update} required /></label><label>Pessoas<input name="pessoas" type="number" min="1" max="100" value={form.pessoas} onChange={update} required /></label><label>Nome<input name="nome" value={form.nome} onChange={update} minLength="2" maxLength="120" required /></label><label>Telefone<input name="telefone" type="tel" value={form.telefone} onChange={update} minLength="8" maxLength="30" required /></label><label className="reserva-full">Observação (opcional)<textarea name="observacao" value={form.observacao} onChange={update} maxLength="500" rows="3" /></label></div>{erro && <p className="reserva-error" role="alert">{erro}</p>}<button className="reserva-submit" type="submit" disabled={enviando}>{enviando ? 'Enviando…' : 'Solicitar reserva'}</button></form></main>;
}

import { useEffect, useState } from 'react';
import { listarReservas, atualizarStatusReserva } from '../services/reservasApi.js';

const STATUS = ['pendente', 'confirmada', 'check_in', 'cancelada', 'no_show'];
const hoje = () => new Date().toISOString().slice(0, 10);

export default function Reservas() {
  const [data, setData] = useState(hoje);
  const [reservas, setReservas] = useState([]);
  const [erro, setErro] = useState('');
  const carregar = async () => { try { setErro(''); setReservas((await listarReservas(data)).reservas || []); } catch (error) { setErro(error.response?.data?.msg || 'Não foi possível carregar as reservas.'); } };
  useEffect(() => { void carregar(); }, [data]);
  const mudarStatus = async (codigo, status) => { try { await atualizarStatusReserva(codigo, status); await carregar(); } catch (error) { setErro(error.response?.data?.msg || 'Não foi possível atualizar a reserva.'); } };

  return <section style={{ padding: 24 }}><header style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}><div><h1>Reservas</h1><p>Agenda da equipe e confirmação de mesas.</p></div><label>Data<input type="date" value={data} onChange={(event) => setData(event.target.value)} /></label></header>{erro && <p role="alert">{erro}</p>}<div style={{ display: 'grid', gap: 12, marginTop: 24 }}>{reservas.map((reserva) => <article key={reserva.codigo} style={{ padding: 16, border: '1px solid #d9e2dc', borderRadius: 12 }}><strong>{reserva.horario} — {reserva.nome}</strong><p>{reserva.pessoas} pessoa(s) · {reserva.telefone} · código {reserva.codigo}</p><label>Status<select value={reserva.status} onChange={(event) => mudarStatus(reserva.codigo, event.target.value)}>{STATUS.map((status) => <option value={status} key={status}>{status}</option>)}</select></label></article>)}</div>{!reservas.length && <p>Nenhuma reserva para esta data.</p>}</section>;
}

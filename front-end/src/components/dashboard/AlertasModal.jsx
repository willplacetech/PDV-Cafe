import { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import './AlertasModal.css';

const dinheiro = (valor) => `R$ ${Number(valor || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function AlertasModal({ alertas, onClose }) {
  const dialogRef = useRef(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    const focoAnterior = document.activeElement;
    const overflowAnterior = document.body.style.overflow;
    dialog.showModal();
    document.body.style.overflow = 'hidden';
    return () => {
      dialog.close();
      document.body.style.overflow = overflowAnterior;
      if (focoAnterior?.isConnected) focoAnterior.focus();
    };
  }, []);

  const fecharAoTocarFora = (event) => {
    if (event.target !== event.currentTarget) return;
    const rect = event.currentTarget.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) onClose();
  };

  return createPortal(<dialog ref={dialogRef} className="day-alerts-dialog" role="dialog" aria-modal="true" aria-labelledby={titleId}
    onClick={fecharAoTocarFora} onCancel={event => { event.preventDefault(); onClose(); }}
    onKeyDown={event => { if (event.key === 'Escape') { event.preventDefault(); onClose(); } }}>
    <header className="day-alerts-heading">
      <div><h2 id={titleId}>Todos os alertas</h2><p>{alertas.length} {alertas.length === 1 ? 'alerta' : 'alertas'} para acompanhar</p></div>
      <button type="button" className="day-alerts-close" aria-label="Fechar alertas" onClick={onClose}>×</button>
    </header>
    <ul className="day-urgency-list day-alerts-list">
      {alertas.map((item, index) => <li className={`urgency-${item.severidade}`} key={`${item.tipo}-${item.titulo}-${index}`}>
        <i aria-hidden="true" /><Link to={item.link || '/dashboard'} onClick={onClose}><strong>{item.titulo}</strong><small>{item.valor ? dinheiro(item.valor) : item.subtitulo}</small></Link>
      </li>)}
    </ul>
  </dialog>, document.body);
}

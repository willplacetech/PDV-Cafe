import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { getBranding } from '../config/branding.js';
import './CardapioHub.css';

const canais = [
  {
    id: 'mesa',
    title: 'Estou na loja',
    description: 'Leia o QR Code da mesa para abrir o cardápio e enviar seu pedido.',
    href: '/cardapio',
    icon: '🍽️',
    action: 'Usar QR da mesa',
  },
  {
    id: 'balcao',
    title: 'Balcão / retirar',
    description: 'Faça seu pedido para retirar no balcão da loja.',
    href: '/cardapio/balcao',
    icon: '🛍️',
    action: 'Pedir para retirar',
  },
  {
    id: 'delivery',
    title: 'Delivery',
    description: 'Receba seu pedido em um endereço informado por você.',
    href: '/cardapio/delivery',
    icon: '🛵',
    action: 'Pedir delivery',
  },
];

export default function CardapioHub() {
  const branding = useMemo(() => getBranding(), []);

  return (
    <main className="cardapio-hub" style={{ '--hub-accent': branding.themeColor }}>
      <section className="cardapio-hub__shell" aria-labelledby="cardapio-hub-title">
        <header className="cardapio-hub__header">
          <img
            className="cardapio-hub__logo"
            src={branding.logoUrl}
            alt={`Logo ${branding.name}`}
            onError={(event) => { event.currentTarget.hidden = true; }}
          />
          <p className="cardapio-hub__eyebrow">{branding.name}</p>
          <h1 id="cardapio-hub-title">Como você quer pedir?</h1>
          <p className="cardapio-hub__tagline">{branding.tagline}</p>
        </header>

        <div className="cardapio-hub__channels">
          {canais.map((canal) => (
            <Link className="cardapio-hub__channel" to={canal.href} key={canal.id}>
              <span className="cardapio-hub__icon" aria-hidden="true">{canal.icon}</span>
              <span className="cardapio-hub__channel-copy">
                <strong>{canal.title}</strong>
                <span>{canal.description}</span>
              </span>
              <span className="cardapio-hub__action">{canal.action} <span aria-hidden="true">→</span></span>
            </Link>
          ))}
        </div>

        <Link className="cardapio-hub__reservation" to="/reserva">
          <span aria-hidden="true">📅</span>
          <span><strong>Reservar uma mesa</strong><small>Agende sua visita com antecedência.</small></span>
          <span aria-hidden="true">→</span>
        </Link>

        <p className="cardapio-hub__help">Aponte a câmera para o QR Code da sua mesa quando estiver na loja.</p>
      </section>
    </main>
  );
}

import { Link, useLocation } from 'react-router-dom';
import './CardapioHub.css';

const CANAIS = {
  balcao: { title: 'Pedido para retirar no balcão', description: 'O fluxo público de balcão será conectado ao pedido na próxima etapa.' },
  delivery: { title: 'Pedido delivery', description: 'O fluxo público de endereço e taxa será conectado ao delivery existente na próxima etapa.' },
};

export default function CardapioCanal() {
  const { pathname } = useLocation();
  const canal = pathname.split('/').filter(Boolean).pop();
  const config = CANAIS[canal] || CANAIS.balcao;

  return (
    <main className="cardapio-hub" style={{ '--hub-accent': '#4f9d6a' }}>
      <section className="cardapio-hub__shell" aria-labelledby="cardapio-canal-title">
        <header className="cardapio-hub__header">
          <p className="cardapio-hub__eyebrow">Cardápio público</p>
          <h1 id="cardapio-canal-title">{config.title}</h1>
          <p className="cardapio-hub__tagline">{config.description}</p>
        </header>
        <Link className="cardapio-hub__reservation" to="/cardapio">
          <span aria-hidden="true">←</span>
          <span><strong>Escolher outro canal</strong><small>Voltar ao início do cardápio.</small></span>
        </Link>
      </section>
    </main>
  );
}

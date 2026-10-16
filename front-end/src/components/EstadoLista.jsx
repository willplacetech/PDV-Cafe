import SkeletonLista from './SkeletonLista.jsx';

const estilos = {
  container: {
    display: 'grid',
    justifyItems: 'center',
    gap: 10,
    padding: '28px 20px',
    border: '1px solid var(--border-color)',
    borderRadius: 12,
    background: 'var(--bg-secondary)',
    color: 'var(--text-primary)',
    textAlign: 'center',
  },
  message: {
    margin: 0,
    color: 'var(--text-secondary)',
    fontSize: 14,
  },
  error: {
    borderColor: 'color-mix(in srgb, var(--error-bg) 35%, var(--border-color))',
  },
  button: {
    minHeight: 44,
    padding: '10px 16px',
    border: '1px solid var(--border-color)',
    borderRadius: 9,
    background: 'var(--bg-tertiary)',
    color: 'var(--text-primary)',
    font: 'inherit',
    fontWeight: 600,
    cursor: 'pointer',
  },
};

export default function EstadoLista({
  carregando,
  erro,
  vazio,
  onRetry,
  iconeVazio,
  tituloVazio,
  mensagemVazia,
  acaoVaziaTexto,
  onAcaoVazia,
  children,
}) {
  if (carregando) {
    return <SkeletonLista />;
  }

  if (erro) {
    const mensagemErro = typeof erro === 'string'
      ? erro
      : erro.message || 'Não foi possível carregar a lista.';

    return (
      <div className="estado-lista estado-lista--erro" role="alert" style={{ ...estilos.container, ...estilos.error }}>
        <p style={{ ...estilos.message, color: 'var(--text-primary)' }}>{mensagemErro}</p>
        {typeof onRetry === 'function' && (
          <button type="button" onClick={onRetry} style={estilos.button}>
            Tentar novamente
          </button>
        )}
      </div>
    );
  }

  if (vazio) {
    return (
      <div className="estado-lista estado-lista--vazio" role="status" style={estilos.container}>
        {iconeVazio && <div aria-hidden="true" style={{ fontSize: 32 }}>{iconeVazio}</div>}
        <h3 style={{ margin: 0, fontSize: 18 }}>{tituloVazio || 'Nenhum registro encontrado'}</h3>
        {mensagemVazia && <p style={estilos.message}>{mensagemVazia}</p>}
        {typeof onAcaoVazia === 'function' && acaoVaziaTexto && (
          <button type="button" onClick={onAcaoVazia} style={estilos.button}>
            {acaoVaziaTexto}
          </button>
        )}
      </div>
    );
  }

  return children ?? null;
}

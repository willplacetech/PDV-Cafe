const estilos = `
  .skeleton-lista {
    display: flex;
    flex-direction: column;
    gap: 12px;
    width: 100%;
    box-sizing: border-box;
  }
  .skeleton-lista__item {
    min-height: 40px;
    border-radius: 6px;
    background: linear-gradient(
      90deg,
      var(--bg-tertiary, #efe2d0) 25%,
      var(--border-color, #ddc9b5) 50%,
      var(--bg-tertiary, #efe2d0) 75%
    );
    background-size: 200% 100%;
    animation: skeleton-lista-loading 1.5s ease-in-out infinite;
  }
  @keyframes skeleton-lista-loading {
    0% { background-position: 200% 0; }
    100% { background-position: -200% 0; }
  }
  @media (prefers-reduced-motion: reduce) {
    .skeleton-lista__item { animation: none; }
  }
`;

const SkeletonLista = ({ itemCount = 5, itemHeight = 56 }) => {
  const count = Number.isFinite(itemCount) ? Math.max(0, Math.floor(itemCount)) : 5;
  const skeletonItems = Array.from({ length: count }, (_, index) => (
    <div
      key={index}
      className="skeleton-lista__item"
      aria-hidden="true"
      style={{ height: itemHeight }}
    />
  ));

  return (
    <>
      <div className="skeleton-lista" role="status" aria-label="Carregando lista" aria-busy="true">
        {skeletonItems}
      </div>
      <style>{estilos}</style>
    </>
  );
};

export default SkeletonLista;

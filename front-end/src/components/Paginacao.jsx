import { useSearchParams } from 'react-router-dom';

const Paginacao = ({ total, paginaAtual, limiteAtual, onChangePagina, onChangeLimite, prefixo = '' }) => {
  const [, setSearchParams] = useSearchParams();
  const parametroPagina = prefixo ? `pagina_${prefixo}` : 'pagina';
  const parametroLimite = prefixo ? `limite_${prefixo}` : 'limite';
  const totalPaginas = Math.ceil(total / limiteAtual);
  const paginaAtualNum = parseInt(paginaAtual, 10) || 1;
  const limiteAtualNum = parseInt(limiteAtual, 10) || 25;

  const handlePageChange = (novaPagina) => {
    if (novaPagina < 1 || novaPagina > totalPaginas || novaPagina === paginaAtualNum) return;
    onChangePagina(novaPagina);
    setSearchParams(prev => {
      prev.set(parametroPagina, novaPagina.toString());
      return prev;
    }, { replace: true });
    window.scrollTo(0, 0);
  };

  const handleLimitChange = (novoLimite) => {
    if (novoLimite === limiteAtualNum) return;
    onChangeLimite?.(novoLimite);
    onChangePagina(1);
    setSearchParams(prev => {
      prev.set(parametroPagina, '1');
      prev.set(parametroLimite, novoLimite.toString());
      return prev;
    }, { replace: true });
    window.scrollTo(0, 0);
  };

  if (total === 0) return null;

  const renderPageNumbers = () => {
    const pages = [];
    const maxVisiblePages = 5;
    let startPage, endPage;

    if (totalPaginas <= maxVisiblePages) {
      startPage = 1;
      endPage = totalPaginas;
    } else {
      if (paginaAtualNum <= Math.ceil(maxVisiblePages / 2)) {
        startPage = 1;
        endPage = maxVisiblePages;
      } else if (paginaAtualNum >= totalPaginas - Math.floor(maxVisiblePages / 2)) {
        startPage = totalPaginas - maxVisiblePages + 1;
        endPage = totalPaginas;
      } else {
        startPage = paginaAtualNum - Math.floor(maxVisiblePages / 2);
        endPage = paginaAtualNum + Math.floor(maxVisiblePages / 2);
      }
    }

    for (let i = startPage; i <= endPage; i++) {
      pages.push(i);
    }

    return pages;
  };

  return (
    <div className="paginacao-minimalista">
      <style>{`
        .paginacao-minimalista {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          flex-wrap: wrap;
          padding: 14px 0 8px;
          margin-top: 20px;
          border-top: 1px solid var(--border-color);
          color: var(--text-secondary);
          font-size: 13px;
        }
        .paginacao-minimalista-info {
          color: var(--text-secondary);
          white-space: nowrap;
        }
        .paginacao-minimalista-controles {
          display: flex;
          align-items: center;
          gap: 8px;
          flex-wrap: wrap;
          margin-left: auto;
        }
        .paginacao-minimalista-arrow,
        .paginacao-minimalista-numero {
          min-width: 32px;
          height: 32px;
          border: 1px solid var(--border-color);
          border-radius: 8px;
          background: var(--bg-secondary);
          color: var(--text-primary);
          display: inline-flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: all 0.2s ease;
          padding: 0 8px;
          font-weight: 700;
          line-height: 1;
        }
        .paginacao-minimalista-arrow:disabled,
        .paginacao-minimalista-numero:disabled {
          opacity: 0.45;
          cursor: not-allowed;
        }
        .paginacao-minimalista-numero {
          min-width: 36px;
          font-size: 13px;
        }
        .paginacao-minimalista-numero.ativo {
          background: var(--accent-primary);
          color: #fff;
          border-color: var(--accent-primary);
        }
        .paginacao-minimalista-numero:hover:not(.ativo),
        .paginacao-minimalista-arrow:hover:not(:disabled) {
          background: var(--bg-tertiary);
        }
        @media (max-width: 640px) {
          .paginacao-minimalista {
            justify-content: center;
          }
          .paginacao-minimalista-controles {
            margin-left: 0;
            justify-content: center;
          }
        }
      `}</style>

      <div className="paginacao-minimalista-info">
        Mostrando {total === 0 ? 0 : (paginaAtualNum - 1) * limiteAtualNum + 1}-{Math.min(paginaAtualNum * limiteAtualNum, total)} de {total} itens.
      </div>

      <div className="paginacao-minimalista-controles">
        <button
          type="button"
          className="paginacao-minimalista-arrow"
          onClick={() => handlePageChange(paginaAtualNum - 1)}
          disabled={paginaAtualNum <= 1}
          aria-label="Página anterior"
        >
          {'<'}
        </button>

        {renderPageNumbers().map(pagina => (
          <button
            key={pagina}
            type="button"
            className={`paginacao-minimalista-numero ${pagina === paginaAtualNum ? 'ativo' : ''}`}
            onClick={() => handlePageChange(pagina)}
            aria-label={`Ir para a página ${pagina}`}
            aria-current={pagina === paginaAtualNum ? 'page' : undefined}
          >
            {pagina}
          </button>
        ))}

        <button
          type="button"
          className="paginacao-minimalista-arrow"
          onClick={() => handlePageChange(paginaAtualNum + 1)}
          disabled={paginaAtualNum >= totalPaginas}
          aria-label="Próxima página"
        >
          {'>'}
        </button>
      </div>
    </div>
  );
};

export default Paginacao;
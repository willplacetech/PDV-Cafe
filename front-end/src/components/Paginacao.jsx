import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';

const Paginacao = ({ total, paginaAtual, limiteAtual, onChangePagina, onChangeLimite, prefixo = '' }) => {
  const [, setSearchParams] = useSearchParams();
  const [limitOptions] = useState([10, 25, 50, 100]);
  const parametroPagina = prefixo ? `pagina_${prefixo}` : 'pagina';
  const parametroLimite = prefixo ? `limite_${prefixo}` : 'limite';
  const idLimite = prefixo ? `limite-select-${prefixo}` : 'limite-select';
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
    onChangeLimite(novoLimite);
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
    <div className="paginacao">
      <style>{`
        .paginacao {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          justify-content: space-between;
          padding: 16px 0;
          margin-top: 24px;
          border-top: 1px solid var(--border-color);
          font-size: 14px;
          color: var(--text-secondary);
        }
        .paginacao-info {
          font-size: 14px;
          color: var(--text-secondary);
        }
        .paginacao-controles {
          display: flex;
          gap: 8px;
          align-items: center;
          flex-wrap: wrap;
        }
        .paginacao-limite-select {
          padding: 4px 8px;
          border: 1px solid var(--border-color);
          border-radius: 4px;
          background: var(--input-bg);
          color: var(--input-text);
          font-size: 14px;
        }
        .paginacao-botao {
          padding: 4px 12px;
          border: 1px solid var(--border-color);
          background: var(--bg-secondary);
          color: var(--text-primary);
          border-radius: 4px;
          cursor: pointer;
          font-size: 14px;
        }
        .paginacao-botao:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
        .paginacao-pagina-atual {
          margin: 0 8px;
          font-weight: 600;
          color: var(--text-primary);
        }
        .paginacao-pagina-numero {
          padding: 4px 8px;
          border-radius: 4px;
          cursor: pointer;
          display: inline-block;
        }
        .paginacao-pagina-numero:hover:not(.paginacao-pagina-atual) {
          background: var(--bg-tertiary);
        }
        .paginacao-pagina-atual {
          background: var(--accent-primary);
          color: #fff;
        }
      `}</style>
      <div className="paginacao-info">
        Mostrando
        {total === 0 ? 0 : (paginaAtualNum - 1) * limiteAtualNum + 1}
        -
        {Math.min(paginaAtualNum * limiteAtualNum, total)}
        de
        {total}
        itens.
      </div>
      <div className="paginacao-controles">
        <div>
          <label htmlFor={idLimite}>Itens por pagina:</label>
          <select
            id={idLimite}
            className="paginacao-limite-select"
            value={limiteAtualNum}
            onChange={(e) => handleLimitChange(parseInt(e.target.value, 10))}
          >
            {limitOptions.map(opt => (
              <option key={opt} value={opt}>{opt}</option>
            ))}
          </select>
        </div>
        <div className="paginacao-navegacao">
          <button
            className="paginacao-botao"
            onClick={() => handlePageChange(paginaAtualNum - 1)}
            disabled={paginaAtualNum <= 1}
          >
            {"<"} Anterior
          </button>
          <div className="paginacao-paginas">
            {renderPageNumbers().map(pagina => (
              <button
                key={pagina}
                className={pagina === paginaAtualNum ? 'paginacao-pagina-atual' : 'paginacao-pagina-numero'}
                onClick={() => handlePageChange(pagina)}
              >
                {pagina}
              </button>
            ))}
          </div>
          <button
            className="paginacao-botao"
            onClick={() => handlePageChange(paginaAtualNum + 1)}
            disabled={paginaAtualNum >= totalPaginas}
          >
            Proximo {">"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default Paginacao;
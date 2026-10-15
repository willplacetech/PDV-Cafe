import { Outlet } from 'react-router-dom';
import { useConfiguracoes } from '../context/ConfiguracoesContext.jsx';

export default function Layout({ children }) {
  const { exigirAutorizacaoGerente } = useConfiguracoes();

  return (
    <div className="app-layout">
      {!exigirAutorizacaoGerente && (
        <div className="banner-aviso">
          Autorizacao de gerente DESLIGADA - risco de fraude. Reative em Configuracoes.
        </div>
      )}
      <div className="layout-content">
        {children ?? <Outlet />}
      </div>
      <style>{`
        .app-layout {
          min-height: 100vh;
          display: flex;
          flex-direction: column;
        }
        .banner-aviso {
          background: #ffeb3b;
          color: #000;
          padding: 8px;
          text-align: center;
          font-weight: 600;
          font-size: 14px;
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          z-index: 1000;
          box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        .layout-content {
          flex: 1;
          padding: 24px;
          margin-top: 40px;
          overflow-y: auto;
        }
      `}</style>
    </div>
  );
}

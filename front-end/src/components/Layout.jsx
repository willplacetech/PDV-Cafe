import { useContext } from 'react';
import { useConfiguracoes } from '../context/ConfiguracoesContext.jsx';
import { Header } from './Header.jsx';
import { Sidebar } from './Sidebar.jsx';

export default function Layout({ children }) {
  const { exigirAutorizacaoGerente } = useConfiguracoes();

  return (
    <>
      {!exigirAutorizacaoGerente && (
        <div className=\"banner-aviso\">
          ?? Autorização de gerente DESLIGADA � risco de fraude. Reative em Configurações.
        </div>
      )}
      <Header />
      <div className=\"layout-body\">
        <Sidebar />
        <main className=\"layout-main\">{children}</main>
      </div>
      <style>{
        .banner-aviso{
          background:#ffeb3b;
          color:#000;
          padding:8px;
          text-align:center;
          font-weight:600;
          position:fixed;
          top:0;
          left:0;
          right:0;
          z-index:1000;
          box-shadow:0 2px 4px rgba(0,0,0,0.1);
        }
        .layout-body{display:flex;height:calc(100vh - 64px);} /* 64px is header height */
        .layout-main{flex:1;padding:24px;overflow-y:auto;}
      }</style>
    </>
  );
}

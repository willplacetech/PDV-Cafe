import { useState, useContext } from 'react';
import { useConfiguracoes } from '../context/ConfiguracoesContext.jsx';
import { useToast } from '../components/useToast.js';

const ConfiguracoesPage = () => {
  const { exigirAutorizacaoGerente, bloqueadoPorSuporte, updateConfiguracoes } = useConfiguracoes();
  const { showToast } = useToast();
  const [loading, setLoading] = useState(false);
  const [modalAberto, setModalAberto] = useState(false);
  const [motivo, setMotivo] = useState('');
  const [valorToggle, setValorToggle] = useState(exigirAutorizacaoGerente);

  const handleChange = async (valor) => {
    if (bloqueadoPorSuporte) {
      showToast('Bloqueado pelo suporte', 'error');
      return;
    }

    if (valor === false) {
      setValorToggle(false);
      setModalAberto(true);
      setMotivo('');
    } else {
      try {
        setLoading(true);
        await updateConfiguracoes(true);
        showToast('Autorizacao de gerente ativada com sucesso', 'success');
      } catch (error) {
        showToast(error.response?.data?.msg || 'Erro ao atualizar configuracao', 'error');
      } finally {
        setLoading(false);
      }
    }
  };

  const handleConfirmarDesligar = async () => {
    if (!motivo || motivo.trim().length < 10) {
      showToast('O motivo deve ter no minimo 10 caracteres', 'warning');
      return;
    }
    try {
      setLoading(true);
      await updateConfiguracoes(false, motivo.trim());
      showToast('Autorizacao de gerente desativada com sucesso', 'success');
    } catch (error) {
      showToast(error.response?.data?.msg || 'Erro ao atualizar configuracao', 'error');
    } finally {
      setLoading(false);
      setModalAberto(false);
    }
  };

  const handleCancelamento = () => {
    setModalAberto(false);
    setValorToggle(exigirAutorizacaoGerente);
  };

  return (
    <main className="configuracoes-page">
      <header className="page-heading">
        <div>
          <span>CONFIGURACOES</span>
          <h1>Autorizacao de Gerente</h1>
          <p>Ative ou desative a exigencia de autorizacao do gerente emacoes criticas.</p>
        </div>
      </header>
      {loading ? (
        <p role="status">Carregando configuracoes...</p>
      ) : (
        <>
          <div className="configuracoes-toggle">
            <label>
              <input
                type="checkbox"
                checked={valorToggle}
                onChange={e => handleChange(e.target.checked)}
                disabled={bloqueadoPorSuporte || loading}
              />
              Exigir autorizacao de gerente em acoes criticas
            </label>
            {bloqueadoPorSuporte && (
              <p className="configuracoes-bloqueado">Bloqueado pelo suporte</p>
            )}
          </div>
          {modalAberto && (
            <div className="modal-backdrop" onClick={handleCancelamento}>
              <div className="modal-content" onClick={e => e.stopPropagation()}>
                <h2>Desativar Autorizacao de Gerente</h2>
                <p>Por favor, informe o motivo para desativar a autorizacao do gerente em acoes criticas.</p>
                <textarea
                  value={motivo}
                  onChange={e => setMotivo(e.target.value)}
                  placeholder="Digite o motivo (minimo 10 caracteres)"
                  maxLength={200}
                />
                <div className="modal-actions">
                  <button type="button" onClick={handleCancelamento} disabled={loading}>
                    Cancelar
                  </button>
                  <button type="button" onClick={handleConfirmarDesligar} disabled={loading || !motivo || motivo.trim().length < 10}>
                    {loading ? 'Desativando...' : 'Desativar'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </>
      )}
      <style>{`
        .configuracoes-page{max-width:960px;margin:0 auto;padding:8px 0 32px;color:var(--text-primary)}
        .configuracoes-page .page-heading>div>span{font-size:10px;font-weight:800;letter-spacing:.1em;color:var(--accent-primary)}
        .configuracoes-page .page-heading h1{margin:5px 0}
        .configuracoes-page .page-heading p{color:var(--text-secondary);font-size:13px}
        .configuracoes-toggle{display:flex;align-items:center;gap:16px;margin:24px 0}
        .configuracoes-toggle label{display:flex;align-items:center;gap:8px;cursor:pointer}
        .configuracoes-toggle input{width:16px;height:16px;cursor:pointer}
        .configuracoes-toggle input:disabled{cursor:not-allowed;opacity:0.5}
        .configuracoes-bloqueado{color:var(--error-bg);font-size:14px}
        .modal-backdrop{position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:1000}
        .modal-content{background:var(--bg-secondary);color:var(--text-primary);padding:24px;border-radius:16px;width:90%;max-width:400px;box-shadow:var(--shadow-sm)}
        .modal-content h2{margin-top:0}
        .modal-content textarea{width:100%;min-height:80px;padding:10px;border:1px solid var(--border-color);border-radius:9px;background:var(--input-bg);color:var(--input-text);font:inherit;margin:12px 0}
        .modal-actions{display:flex;gap:12px;justify-content:flex-end}
        .modal-actions button{min-height:44px;padding:10px;border:0;border-radius:9px;font:inherit;font-weight:800;cursor:pointer}
        .modal-actions button:first-child{background:var(--bg-tertiary);color:var(--text-primary);border:1px solid var(--border-color)}
        .modal-actions button:last-child{background:var(--accent-primary);color:#fff}
        .modal-actions button:disabled{opacity:.6;cursor:wait}
        @media(max-width:600px){
          .configuracoes-toggle{flex-direction:column;align-items:flex-start}
          .modal-content{width:95%}
        }
      `}</style>
    </main>
  );
};

export default ConfiguracoesPage;
import { useState } from 'react';
import useFilaOffline from '../hooks/useFilaOffline.js';
import { useConfiguracoes } from '../hooks/useConfiguracoes.js';
import { useToast } from './useToast.js';

const mensagemAutorizacaoDesligada = 'Autorização de gerente DESLIGADA — risco de fraude. Reative em Configurações.';

export default function StatusConexao({ compacto = false }) {
  const { showToast } = useToast();
  const { pendentes, online, armazenamentoCheio, origensPendentes, resolverOrigem } = useFilaOffline();
  const { exigirAutorizacaoGerente } = useConfiguracoes();
  const [avisoAutorizacaoAberto, setAvisoAutorizacaoAberto] = useState(false);
  const confirmarOrigem = async id => {
    const reason = window.prompt('Informe como conferiu a origem desta venda legada. Ela sera vinculada ao seu operador e comercio atuais:');
    if (!reason || reason.trim().length < 3) return;
    const confirmed = window.confirm(`Confirmar a origem da venda ${id} para seu operador e comercio atuais? Motivo: ${reason}`);
    if (!confirmed) return;
    try {
      await resolverOrigem(id, reason, true);
      showToast('Origem da venda confirmada e sincronizada.', 'success');
    }
    catch (error) { showToast(error.message || 'Não foi possível confirmar a origem da venda.', 'error'); }
  };
  const cor = online ? 'var(--success-bg)' : 'var(--error-bg)';
  const statusTexto = online ? 'Conectado' : 'Desconectado';

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        display: 'inline-grid',
        width: 'fit-content',
        maxWidth: '100%',
        gap: 3,
        minWidth: 0,
        padding: compacto ? '5px 8px' : '9px 10px',
        border: `1px solid ${cor}`,
        borderRadius: 8,
        color: 'var(--text-primary)',
        fontSize: 11,
        lineHeight: 1.35,
        overflowWrap: 'anywhere',
        justifySelf: 'flex-end',
      }}
    >
      <strong style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span
          role="img"
          aria-label={statusTexto}
          title={statusTexto}
          style={{
            display: 'inline-block',
            width: 10,
            height: 10,
            flex: '0 0 10px',
            borderRadius: '50%',
            background: cor,
            boxShadow: `0 0 0 2px color-mix(in srgb, ${cor} 22%, transparent)`,
          }}
        />
        {exigirAutorizacaoGerente === false && (
          <span style={{ position: 'relative', display: 'inline-flex' }}>
            <button
              type="button"
              aria-label="Aviso: autorização de gerente desligada"
              title={mensagemAutorizacaoDesligada}
              aria-expanded={avisoAutorizacaoAberto}
              onPointerEnter={event => {
                if (event.pointerType === 'mouse') setAvisoAutorizacaoAberto(true);
              }}
              onPointerLeave={event => {
                if (event.pointerType === 'mouse') setAvisoAutorizacaoAberto(false);
              }}
              onClick={event => {
                if (event.nativeEvent.pointerType === 'mouse') setAvisoAutorizacaoAberto(true);
                else setAvisoAutorizacaoAberto(aberto => !aberto);
              }}
              style={{ padding: 0, border: 0, background: 'transparent', fontSize: 'inherit', lineHeight: 1, cursor: 'help' }}
            >
              <span aria-hidden="true">⚠️</span>
            </button>
            {avisoAutorizacaoAberto && (
              <span
                role="tooltip"
                style={{
                  position: 'absolute',
                  top: 'calc(100% + 8px)',
                  right: 0,
                  zIndex: 300,
                  width: 260,
                  padding: '10px 12px',
                  borderRadius: 8,
                  background: 'var(--bg-secondary)',
                  border: '1px solid var(--border-color)',
                  boxShadow: 'var(--shadow-lg)',
                  color: 'var(--text-primary)',
                  fontSize: 12,
                  fontWeight: 600,
                  whiteSpace: 'normal',
                }}
              >
                {mensagemAutorizacaoDesligada}
              </span>
            )}
          </span>
        )}
        {pendentes > 0 && ` · ⚠️ ${pendentes} venda(s) pendente(s)`}
      </strong>
      {armazenamentoCheio && <span style={{ color: 'var(--error-bg)', fontWeight: 700 }}>Conecte à internet para sincronizar</span>}
      {pendentes > 0 && <span>Não limpe os dados do site enquanto houver vendas pendentes.</span>}
      {origensPendentes.length > 0 && <span>Vendas preservadas para revisão: {origensPendentes.length}.</span>}
      {origensPendentes.map(item => item.motivoQuarentena === 'OFFLINE_ORIGIN_MISMATCH'
        ? <span key={item.idTemporario}>A venda {item.idTemporario} foi rejeitada porque o operador ou comércio mudou. Confira os dados antes de lançá-la novamente.</span>
        : <button key={item.idTemporario} type="button" onClick={() => confirmarOrigem(item.idTemporario)}>Conferir origem: {item.idTemporario}</button>)}
    </div>
  );
}

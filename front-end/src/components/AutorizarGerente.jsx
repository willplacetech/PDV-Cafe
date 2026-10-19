import { useContext, useEffect, useRef, useState } from 'react';
import { AuthContext } from '../context/AuthContextDefinition.jsx';
import api from '../services/api.jsx';
import { guardarAutorizacao } from '../services/managerApproval.js';
import { getSessionGeneration } from '../services/accessSession.js';

export default function AutorizarGerente({ acao, titulo, descricao, aberto, onCancelar, onConfirmado }) {
  const { user } = useContext(AuthContext);
  const [senha, setSenha] = useState('');
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState('');
  const [bloqueadoAte, setBloqueadoAte] = useState(0);
  const bloqueado = bloqueadoAte > 0;
  const inputRef = useRef(null);
  const active = useRef(false);
  useEffect(() => {
    active.current = true;
    return () => { active.current = false; };
  }, []);

  const eGerenteOuAdmin = user?.role === 'admin' || user?.role === 'gerente';
  const hint = eGerenteOuAdmin
    ? 'Informe SUA senha para confirmar.'
    : 'Peça para um gerente/admin digitar a senha.';

  useEffect(() => {
    if (aberto) {
      const previous = document.activeElement;
      inputRef.current?.focus();
      return () => previous?.focus();
    }
  }, [aberto]);

  useEffect(() => {
    if (!aberto || !bloqueado) return;
    const timer = setTimeout(() => { setBloqueadoAte(0); setErro(''); }, Math.max(0, bloqueadoAte - Date.now()));
    return () => clearTimeout(timer);
  }, [aberto, bloqueado, bloqueadoAte]);

  const confirmar = async (event) => {
    event?.preventDefault();
    if (carregando || bloqueado) return;

    setCarregando(true);
    setErro('');
    const generation = getSessionGeneration();
    try {
      const { data } = await api.post('/auth/autorizar', { senha, acao });
      if (!active.current || generation !== getSessionGeneration()) return;
      if (!data.tokenAutorizacao) {
        throw new Error('Autorização rejeitada');
      }
      guardarAutorizacao(acao, data.tokenAutorizacao);
      onConfirmado(data.tokenAutorizacao);
    } catch (error) {
      const data = error.response?.data;
      if (error.response?.status === 429) setBloqueadoAte(data.bloqueadoAte);
      setErro(`${data?.msg || 'Não foi possível autorizar. Tente novamente.'}${data?.tentativasRestantes != null ? ` Tentativas restantes: ${data.tentativasRestantes}.` : ''}`);
    } finally {
      setCarregando(false);
      setSenha('');
    }
  };

  if (!aberto) return null;

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 99999, padding: 20,
    }} onClick={() => { if (!carregando) onCancelar(); }}>
      <form onSubmit={confirmar} onClick={(e) => e.stopPropagation()} style={{
        background: 'var(--bg-secondary)', borderRadius: 16, padding: 24,
        width: '100%', maxWidth: 360, boxShadow: 'var(--shadow-lg)',
      }} role="dialog" aria-modal="true" aria-label="Autorização de gerente" onKeyDown={event => {
        if (event.key === 'Escape' && !carregando) onCancelar();
        if (event.key === 'Tab') {
          const controls = [...event.currentTarget.querySelectorAll('input:not(:disabled), button:not(:disabled)')];
          const first = controls[0], last = controls.at(-1);
          if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
          else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
        }
      }}>
        <h3 style={{ margin: '0 0 8px', fontSize: 18, color: 'var(--text-primary)' }}>🔒 Confirmação necessária</h3>
        <p style={{ margin: '0 0 16px', fontSize: 14, color: 'var(--text-secondary)' }}>{titulo || descricao || acao.replaceAll('_', ' ')}</p>
        <p style={{ margin: '0 0 12px', fontSize: 13, color: 'var(--text-primary)', fontWeight: 600 }}>{hint}</p>
        <input
          ref={inputRef}
          type="password"
          aria-label="Senha do gerente ou administrador"
          autoComplete="current-password"
          value={senha}
          onChange={(e) => setSenha(e.target.value)}
          placeholder="Senha"
          aria-invalid={Boolean(erro) || undefined}
          style={{ width: '100%', marginBottom: 12, borderColor: erro ? 'var(--error-bg)' : undefined, opacity: bloqueado ? 0.5 : 1 }}
          disabled={bloqueado}
          autoFocus
        />
        {erro && <p role="alert" style={{ margin: '0 0 12px', fontSize: 12, color: 'var(--error-text)' }}>{erro}</p>}
        <div style={{ display: 'flex', gap: 10 }}>
          <button type="button" onClick={onCancelar} disabled={carregando} style={{
            flex: 1, padding: '12px 16px', background: 'var(--bg-tertiary)',
            color: 'var(--text-primary)', border: '1px solid var(--border-color)',
            borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', minHeight: 48,
          }}>Cancelar</button>
          <button type="submit" disabled={carregando || bloqueado || !senha.trim()} style={{
            flex: 1, padding: '12px 16px', background: 'var(--accent-primary)',
            color: 'var(--accent-text)', border: 'none', borderRadius: 10,
            fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', minHeight: 48,
            opacity: carregando || bloqueado || !senha.trim() ? 0.6 : 1,
          }}>{carregando ? 'Aguarde…' : 'Confirmar'}</button>
        </div>
      </form>
    </div>
  );
}

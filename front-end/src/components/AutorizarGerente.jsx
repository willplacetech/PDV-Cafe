import { useContext, useEffect, useRef, useState } from 'react';
import { AuthContext } from '../context/AuthContextDefinition.jsx';
import api from '../services/api.jsx';

const EXIGIR_LOCAL = typeof import.meta !== 'undefined' && import.meta.env?.VITE_EXIGIR_AUTORIZACAO_GERENTE !== 'false';

const autorizacaoCache = new Map();
const CACHE_MS = 4 * 60 * 1000;

export function limparCacheAutorizacao(acao) {
  if (acao) autorizacaoCache.delete(acao);
  else autorizacaoCache.clear();
}

export function getAutorizacaoCache(acao, userRole) {
  if (!EXIGIR_LOCAL) return { token: null, reaproveitado: true };
  const entry = autorizacaoCache.get(acao);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > CACHE_MS) {
    autorizacaoCache.delete(acao);
    return null;
  }
  if (entry.role === 'operador' && userRole !== entry.userRole) return null;
  return entry;
}

export default function AutorizarGerente({ acao, titulo, descricao, aberto, onCancelar, onConfirmado }) {
  const { user } = useContext(AuthContext);
  const [senha, setSenha] = useState('');
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState('');
  const [tentativas, setTentativas] = useState(0);
  const [bloqueado, setBloqueado] = useState(false);
  const inputRef = useRef(null);

  const eGerenteOuAdmin = user?.role === 'admin' || user?.role === 'gerente';
  const hint = eGerenteOuAdmin
    ? 'Informe SUA senha para confirmar.'
    : 'Peça para um gerente/admin digitar a senha.';

  useEffect(() => {
    if (aberto) {
      setSenha('');
      setErro('');
      setTentativas(0);
      setBloqueado(false);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [aberto]);

  useEffect(() => {
    if (!aberto || !bloqueado) return;
    const timer = setTimeout(() => setBloqueado(false), 60_000);
    return () => clearTimeout(timer);
  }, [aberto, bloqueado]);

  const confirmar = async (event) => {
    event?.preventDefault();
    if (carregando || bloqueado) return;
    if (tentativas >= 3) { setBloqueado(true); return; }

    setCarregando(true);
    setErro('');
    try {
      const { data } = await api.post('/auth/autorizar', { senha, acao });
      if (!data.tokenAutorizacao && !data.autorizado) {
        throw new Error('Autorização rejeitada');
      }
      autorizacaoCache.set(acao, {
        token: data.tokenAutorizacao,
        timestamp: Date.now(),
        role: eGerenteOuAdmin ? user.role : user.role,
        userRole: user.role,
      });
      onConfirmado(data.tokenAutorizacao);
    } catch (error) {
      const proximas = tentativas + 1;
      setTentativas(proximas);
      if (proximas >= 3) {
        setBloqueado(true);
        setErro(`Senha incorreta. Bloqueado por 60s. ${proximas} tentativa(s).`);
      } else {
        setErro(`Senha incorreta. Tentativas restantes: ${3 - proximas}.`);
      }
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
    }} onClick={onCancelar}>
      <form onSubmit={confirmar} onClick={(e) => e.stopPropagation()} style={{
        background: 'var(--bg-secondary)', borderRadius: 16, padding: 24,
        width: '100%', maxWidth: 360, boxShadow: 'var(--shadow-lg)',
      }}>
        <h3 style={{ margin: '0 0 8px', fontSize: 18, color: 'var(--text-primary)' }}>Confirmação necessária</h3>
        <p style={{ margin: '0 0 16px', fontSize: 14, color: 'var(--text-secondary)' }}>{titulo || descricao}</p>
        <p style={{ margin: '0 0 12px', fontSize: 13, color: 'var(--text-primary)', fontWeight: 600 }}>{hint}</p>
        <input
          ref={inputRef}
          type="password"
          autoComplete="current-password"
          value={senha}
          onChange={(e) => setSenha(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') e.preventDefault(); }}
          placeholder="Senha"
          style={{
            width: '100%', padding: '12px', marginBottom: 12,
            border: `1px solid ${erro ? 'var(--error-bg)' : 'var(--border-color)'}`,
            borderRadius: 8, background: 'var(--input-bg)',
            color: 'var(--input-text)', fontSize: 14,
            opacity: bloqueado ? 0.5 : 1,
          }}
          disabled={bloqueado}
          autoFocus
        />
        {erro && <p role="alert" style={{ margin: '0 0 12px', fontSize: 12, color: 'var(--error-text)' }}>{erro}</p>}
        <div style={{ display: 'flex', gap: 10 }}>
          <button type="button" onClick={onCancelar} disabled={carregando} style={{
            flex: 1, padding: '12px', background: 'var(--bg-tertiary)',
            color: 'var(--text-primary)', border: '1px solid var(--border-color)',
            borderRadius: 10, fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', minHeight: 44,
          }}>Cancelar</button>
          <button type="submit" disabled={carregando || bloqueado || !senha.trim()} style={{
            flex: 1, padding: '12px', background: 'var(--accent-primary)',
            color: '#fff', border: 'none', borderRadius: 10,
            fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', minHeight: 44,
            opacity: carregando || bloqueado || !senha.trim() ? 0.6 : 1,
          }}>{carregando ? 'Aguarde…' : 'Confirmar'}</button>
        </div>
      </form>
    </div>
  );
}

export function useAutorizacao(acao) {
  const { user } = useContext(AuthContext);
  const [autorizado, setAutorizado] = useState(null);

  useEffect(() => {
    const cached = getAutorizacaoCache(acao, user?.role);
    setAutorizado(cached ? { token: cached.token, reaproveitado: true } : null);
  }, [acao, user?.role]);

  const solicitar = () => new Promise((resolve, reject) => {
    setAutorizado({ token: null, aberto: true, resolver: resolve, rejeitar: reject });
  });

  const confirmado = (token) => {
    setAutorizado(token ? { token } : null);
  };

  return { autorizado, solicitar, confirmado };
}

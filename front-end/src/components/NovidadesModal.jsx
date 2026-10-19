import { useEffect, useState } from 'react';
import { APP_VERSION, fetchPublishedAppVersion, waitForServiceWorkerUpdate } from '../services/appVersion.js';

export default function NovidadesModal() {
  const [aberto, setAberto] = useState(false);
  const [versaoServidor, setVersaoServidor] = useState(null);
  const [carregando, setCarregando] = useState(false);

  useEffect(() => {
    if (APP_VERSION === 'development') return;
    let ativo = true;
    const verificarVersao = () => {
      void fetchPublishedAppVersion()
        .then(versao => {
          if (ativo && versao && versao !== APP_VERSION) {
            setVersaoServidor(versao);
            setAberto(true);
          }
        })
        .catch(() => {
          // versão não verificável — silencioso
        });
    };
    verificarVersao();
    const intervalo = setInterval(verificarVersao, 60_000);
    return () => {
      ativo = false;
      clearInterval(intervalo);
    };
  }, []);

  const aplicarAtualizacao = async () => {
    setCarregando(true);
    try {
      if (!navigator.serviceWorker?.controller) {
        window.location.reload();
        return;
      }
      const registration = await navigator.serviceWorker.getRegistration();
      if (registration?.waiting) {
        await waitForServiceWorkerUpdate(registration, navigator.serviceWorker);
        window.location.reload();
      } else {
        window.location.reload();
      }
    } catch {
      window.location.reload();
    } finally {
      setCarregando(false);
    }
  };

  const novidades = [
    'Autorização por senha de gerente em ações críticas',
    'Loading estados profissionais (skeleton e empty states)',
    'Exportação CSV de clientes',
    'Auditoria completa de ações autorizadas',
    'Nova role de gerente com permissões granulares',
  ];

  if (!aberto) return null;

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 99999, padding: 20,
    }} onClick={() => setAberto(false)}>
      <div onClick={(e) => e.stopPropagation()} style={{
        background: 'var(--bg-secondary)', borderRadius: 16, padding: 24,
        width: '100%', maxWidth: 400, boxShadow: 'var(--shadow-lg)',
        border: '1px solid var(--border-color)',
      }}>
        <h3 style={{ margin: '0 0 16px', fontSize: 18, color: 'var(--text-primary)' }}>Nova versão disponível</h3>
        {versaoServidor && <p style={{ margin: '0 0 12px', fontSize: 13, color: 'var(--text-secondary)' }}>v{APP_VERSION} → <strong style={{ color: 'var(--accent-primary)' }}>v{versaoServidor}</strong></p>}
        <ul style={{ margin: '0 0 16px', paddingLeft: 20, fontSize: 13, color: 'var(--text-secondary)' }}>
          {novidades.map((item) => <li key={item} style={{ marginBottom: 4 }}>{item}</li>)}
        </ul>
        <div style={{ display: 'flex', gap: 10 }}>
          <button type="button" onClick={() => setAberto(false)} disabled={carregando} style={{
            flex: 1, padding: '12px 16px', background: 'var(--bg-tertiary)',
            color: 'var(--text-primary)', border: '1px solid var(--border-color)',
            borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', minHeight: 48,
          }}>Agora não</button>
          <button type="button" onClick={aplicarAtualizacao} disabled={carregando} style={{
            flex: 1, padding: '12px 16px', background: 'var(--accent-primary)',
            color: 'var(--accent-text)', border: 'none', borderRadius: 10,
            fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', minHeight: 48,
            opacity: carregando ? 0.6 : 1,
          }}>{carregando ? 'Atualizando...' : 'Atualizar'}</button>
        </div>
      </div>
    </div>
  );
}

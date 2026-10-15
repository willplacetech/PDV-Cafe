export function captureException(error, contexto) {
  console.error('[ErrorBoundary]', {
    mensagem: error?.message,
    stack: error?.stack,
    contexto,
  });
  if (import.meta.env?.PROD && typeof fetch === 'function') {
    void fetch('/api/log-client-error', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mensagem: error?.message,
        stack: error?.stack,
        contexto,
        userAgent: navigator.userAgent,
        timestamp: new Date().toISOString(),
      }),
    }).catch(() => {});
  }
}

export function captureMessage(mensagem, nivel = 'warning') {
  if (nivel === 'error') console.error('[Error]', mensagem);
  else if (nivel === 'warning') console.warn('[Warning]', mensagem);
  else console.info('[Info]', mensagem);
}

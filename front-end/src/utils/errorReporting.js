import { captureException as reportException } from '../services/sentry.js';

export function captureException(error, contexto) {
  reportException(error);
  console.error('[ErrorBoundary]', {
    mensagem: error?.message,
    stack: error?.stack,
    contexto,
  });
}

export function captureMessage(mensagem, nivel = 'warning') {
  if (nivel === 'error') console.error('[Error]', mensagem);
  else if (nivel === 'warning') console.warn('[Warning]', mensagem);
  else console.info('[Info]', mensagem);
}

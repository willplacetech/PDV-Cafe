import * as Sentry from '@sentry/react';
import { APP_VERSION } from './appVersion.js';
import { readCachedProfile } from './accessSession.js';

export function sanitizeEvent(event) {
  return {
    event_id: event.event_id, timestamp: event.timestamp, platform: event.platform,
    level: event.level, release: event.release, environment: event.environment,
    user: event.user?.id ? { id: String(event.user.id) } : undefined,
    exception: event.exception && { values: event.exception.values?.map(value => ({
      type: value.type, value: 'Erro capturado (mensagem removida por privacidade)',
      stacktrace: value.stacktrace && { frames: value.stacktrace.frames?.map(frame => ({
        filename: frame.filename?.split(/[?#]/)[0], function: frame.function,
        lineno: frame.lineno, colno: frame.colno, in_app: frame.in_app,
      })) },
    })) },
  };
}

if (import.meta.env?.VITE_SENTRY_DSN) {
  Sentry.init({
    dsn: import.meta.env.VITE_SENTRY_DSN, release: APP_VERSION,
    environment: import.meta.env.MODE, sendDefaultPii: false,
    beforeSend: sanitizeEvent,
  });
  const identify = user => Sentry.setUser(user?.id ? { id: String(user.id) } : null);
  identify(readCachedProfile());
  window.addEventListener('session:change', event => {
    if (event.detail.scope === 'pdv') identify(event.detail.user);
  });
}

export const captureException = error => Sentry.captureException(error);

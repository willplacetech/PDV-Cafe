const Sentry = require('@sentry/node');

// Lista permitida: mensagens de banco/HTTP podem conter senhas e dados de clientes.
function sanitizeEvent(event) {
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

if (process.env.SENTRY_DSN) Sentry.init({
  dsn: process.env.SENTRY_DSN,
  release: process.env.APP_VERSION || process.env.RENDER_GIT_COMMIT || require('./package.json').version,
  environment: process.env.NODE_ENV || 'development',
  sendDefaultPii: false,
  beforeSend: sanitizeEvent,
});

function captureException(error, userId) {
  Sentry.withScope(scope => {
    scope.setUser(userId ? { id: String(userId) } : null);
    Sentry.captureException(error);
  });
}

module.exports = { captureException, sanitizeEvent };

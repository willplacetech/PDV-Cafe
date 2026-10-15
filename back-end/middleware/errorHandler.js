const capturarContextoRequisicao = (req) => ({
  metodo: req.method,
  caminho: req.originalUrl || req.path,
  ip: req.ip,
  userAgent: req.get('user-agent'),
  usuarioId: req.user?.id,
  usuarioRole: req.user?.role,
});

const errorHandler = (err, req, res, next) => {
  if (res.headersSent) return next(err);

  const status = Number(err.status || err.statusCode) || 500;
  const contexto = capturarContextoRequisicao(req);

  if (status >= 500) {
    console.error(JSON.stringify({
      evento: 'ServerError',
      status,
      mensagem: err.message,
      stack: err.stack,
      contexto,
    }));
  } else {
    console.warn(JSON.stringify({
      evento: 'ClientError',
      status,
      mensagem: err.message,
      contexto,
    }));
  }

  const msg = status >= 500 && status !== 503
    ? 'Erro interno do servidor'
    : err.message || 'Erro interno do servidor';

  res.status(status).json({ msg });
};

module.exports = errorHandler;

const emitirEventoApi = nome => {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(nome));
};

const finalizarRequisicao = config => {
  if (!config?.pdvRequisicaoEmAndamento) return;
  config.pdvRequisicaoEmAndamento = false;
  emitirEventoApi('pdv:request-end');
};

export const attachRequestTracker = api => {
  api.interceptors.request.use(config => {
    if (config.pdvSilenciosa) return config;
    if (!config.pdvRequisicaoEmAndamento) {
      config.pdvRequisicaoEmAndamento = true;
      emitirEventoApi('pdv:request-start');
    }
    return config;
  });

  api.interceptors.response.use(
    response => {
      finalizarRequisicao(response.config);
      return response;
    },
    error => {
      finalizarRequisicao(error.config);
      return Promise.reject(error);
    }
  );
};

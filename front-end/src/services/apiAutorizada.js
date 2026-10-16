import api, { setHeaderAutorizacao } from './api.jsx';
import { getAutorizacaoCache } from './managerApproval.js';

export async function requestAutorizado(method, url, body, acao, solicitar) {
  const tentativa = async (config) => {
    try {
      const response = await api.request({ method, url, data: body, ...config });
      return response;
    } catch (err) {
      if (err.autorizacaoNecessaria && solicitar) {
        const token = await solicitar();
        return api.request(setHeaderAutorizacao({ method, url, data: body }, token));
      }
      throw err;
    }
  };
  return tentativa(setHeaderAutorizacao({}, getAutorizacaoCache(acao)?.token));
}

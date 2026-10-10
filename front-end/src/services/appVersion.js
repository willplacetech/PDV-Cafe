export const APP_VERSION = import.meta.env?.VITE_APP_VERSION || 'development';

export const fetchPublishedAppVersion = async (fetchImpl = globalThis.fetch) => {
  if (typeof fetchImpl !== 'function') throw new Error('A verificação de versão não está disponível neste navegador.');

  const controller = new AbortController();
  const timeout = globalThis.setTimeout(() => controller.abort(), 5000);
  let response;
  try {
    response = await fetchImpl(`/version.json?check=${Date.now()}`, {
      cache: 'no-store',
      headers: {
        'Cache-Control': 'no-cache',
        Pragma: 'no-cache',
      },
      signal: controller.signal,
    });
  } finally {
    globalThis.clearTimeout(timeout);
  }
  if (!response.ok) throw new Error(`A verificação de versão retornou HTTP ${response.status}.`);

  const payload = await response.json();
  if (typeof payload?.version !== 'string' || !payload.version.trim()) {
    throw new Error('A resposta de versão do servidor é inválida.');
  }
  return payload.version;
};

export const waitForServiceWorkerUpdate = async (registration, serviceWorker, timeoutMs = 15000) => {
  const previousController = serviceWorker.controller;
  let timeout;
  let onControllerChange;
  const controllerChanged = new Promise((resolve, reject) => {
    onControllerChange = () => resolve();
    serviceWorker.addEventListener('controllerchange', onControllerChange, { once: true });
    timeout = globalThis.setTimeout(() => reject(new Error('O service worker atualizado não assumiu o controle a tempo.')), timeoutMs);
  });

  try {
    await registration.update();
    registration.waiting?.postMessage({ type: 'SKIP_WAITING' });
    if (serviceWorker.controller !== previousController) return;
    await controllerChanged;
  } finally {
    globalThis.clearTimeout(timeout);
    serviceWorker.removeEventListener('controllerchange', onControllerChange);
  }
};

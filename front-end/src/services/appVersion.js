export const APP_VERSION = import.meta.env?.VITE_APP_VERSION || 'development';
export const APP_GIT_HASH = typeof __GIT_HASH__ === 'string' ? __GIT_HASH__ : 'dev';

export const restorePreloadRecoveryPath = (browserWindow) => {
  const recoveryPath = new URL(browserWindow.location.href);
  if (!recoveryPath.pathname.startsWith('/__pdv-recovery/')) return false;

  const originalPath = recoveryPath.searchParams.get('__pdv_path');
  if (!originalPath?.startsWith('/') || originalPath.startsWith('//')) {
    console.error('[PWA] O caminho original para recuperar a aplicação é inválido.');
    return false;
  }

  const destination = new URL(originalPath, recoveryPath.origin);
  if (destination.origin !== recoveryPath.origin) {
    console.error('[PWA] O caminho de recuperação não pode alterar a origem da aplicação.');
    return false;
  }

  browserWindow.history.replaceState(
    null,
    '',
    `${destination.pathname}${destination.search}${destination.hash}`,
  );
  return true;
};

export const installPreloadErrorRecovery = (browserWindow, appVersion = APP_VERSION) => {
  const recoveryKey = `pdv:preload-recovery:${appVersion}`;
  const handlePreloadError = (event) => {
    try {
      if (browserWindow.sessionStorage.getItem(recoveryKey) === '1') return;
      browserWindow.sessionStorage.setItem(recoveryKey, '1');
    } catch (error) {
      console.error('[PWA] Não foi possível proteger a recuperação contra recarregamentos repetidos.', error);
      return;
    }

    event.preventDefault();
    const clearStaleAppData = async () => {
      const registrations = await browserWindow.navigator?.serviceWorker?.getRegistrations?.() ?? [];
      const cacheNames = await browserWindow.caches?.keys?.() ?? [];
      await Promise.all([
        ...registrations.map((registration) => registration.unregister()),
        ...cacheNames.map((cacheName) => browserWindow.caches.delete(cacheName)),
      ]);
    };
    const reloadWithFreshAssets = () => {
      try {
        const currentUrl = new URL(browserWindow.location.href);
        const retryUrl = new URL(
          `/__pdv-recovery/${encodeURIComponent(appVersion)}/index.html`,
          currentUrl.origin,
        );
        retryUrl.searchParams.set(
          '__pdv_path',
          `${currentUrl.pathname}${currentUrl.search}${currentUrl.hash}`,
        );
        browserWindow.location.replace(retryUrl.href);
      } catch (error) {
        console.error('[PWA] Não foi possível atualizar o endereço para recarregar os arquivos.', error);
        browserWindow.location.reload();
      }
    };

    void clearStaleAppData()
      .catch((error) => console.error('[PWA] Não foi possível limpar os recursos locais antigos.', error))
      .finally(reloadWithFreshAssets);
  };

  browserWindow.addEventListener('vite:preloadError', handlePreloadError);
  return () => browserWindow.removeEventListener('vite:preloadError', handlePreloadError);
};

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

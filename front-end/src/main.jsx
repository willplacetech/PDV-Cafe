import './services/sentry.js';
import React from 'react';
import ReactDOM from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import App from './App.jsx';
import './styles/theme.css';
import { branding } from './config/branding.js';

if (typeof document !== 'undefined') {
  document.title = branding.name;
  const themeMeta = document.querySelector('meta[name="theme-color"]');
  if (themeMeta) themeMeta.setAttribute('content', branding.themeColor);
  const appleTitle = document.querySelector('meta[name="apple-mobile-web-app-title"]');
  if (appleTitle) appleTitle.setAttribute('content', branding.shortName);
}

registerSW({
  immediate: true,
  onRegisterError: (error) => console.error('[PWA] Não foi possível registrar o service worker.', error),
});

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
if ('caches' in window) caches.delete('api-cache').catch(() => {});

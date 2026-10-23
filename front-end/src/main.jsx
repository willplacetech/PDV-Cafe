import './services/sentry.js';
import React from 'react';
import ReactDOM from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import App from './App.jsx';
import './styles/theme.css';
import { applyBrandingToDocument, fetchServerBranding } from './config/branding.js';

applyBrandingToDocument();
void fetchServerBranding();

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

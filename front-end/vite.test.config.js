import react from '@vitejs/plugin-react';
import config from './vite.config.js';
import { fileURLToPath } from 'node:url';

export default {
  ...config,
  plugins: [react({ include: /\.[jt]sx?$/ }), ...config.plugins.slice(1)],
  resolve: {
    ...config.resolve,
    alias: [
      {
        find: /\.\.\/hooks\/useAutorizacaoGerente\.js$/,
        replacement: fileURLToPath(new URL('./src/hooks/useAutorizacaoGerente.test.js', import.meta.url)),
      },
      ...(config.resolve?.alias || []),
    ],
  },
};


import { defineConfig } from 'cypress';

export default defineConfig({
  e2e: {
    baseUrl: 'http://localhost:5173',
    viewportWidth: 1280,
    viewportHeight: 720,
    specPattern: 'tests/e2e/**/*.cy.js',
    setupNodeEvents(on, config) {
      return config;
    },
  },
});

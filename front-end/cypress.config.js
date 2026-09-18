
import { defineConfig } from 'cypress';

export default defineConfig({
  e2e: {
    baseUrl: 'http://localhost:5173',
    viewportWidth: 1280,
    viewportHeight: 720,
    specPattern: 'tests/e2e/**/*.cy.js',
    supportFile: false,
    defaultCommandTimeout: 10000,
    video: false,
    screenshotOnRunFailure: true,
    setupNodeEvents(on, config) {
      return config;
    },
  },
});

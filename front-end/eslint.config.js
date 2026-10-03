import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
  },
  {
    files: ['tests/e2e/**/*.js', 'cypress/**/*.js'],
    languageOptions: { globals: { ...globals.browser, ...globals.mocha, cy: 'readonly', Cypress: 'readonly', expect: 'readonly' } },
  },
  {
    files: ['tests/*.test.js', 'cypress.config.js'],
    languageOptions: { globals: globals.node },
  },
])

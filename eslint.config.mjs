import js from '@eslint/js';

export default [
  js.configs.recommended,
  {
    files: ['app.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'script',
      globals: {
        window: 'readonly',
        document: 'readonly',
        navigator: 'readonly',
        localStorage: 'readonly',
        location: 'readonly',
        URLSearchParams: 'readonly',
        URL: 'readonly',
        fetch: 'readonly',
        FileReader: 'readonly',
        Blob: 'readonly',
        atob: 'readonly',
        btoa: 'readonly',
        TextDecoder: 'readonly',
        TextEncoder: 'readonly',
        Uint8Array: 'readonly',
        Intl: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        console: 'readonly'
      }
    },
    rules: {
      'no-unused-vars': ['warn', { args: 'none' }],
      'no-empty': ['error', { allowEmptyCatch: true }]
    }
  },
  {
    files: ['tailwind.config.js'],
    languageOptions: { ecmaVersion: 2022, sourceType: 'commonjs', globals: { module: 'writable', require: 'readonly' } }
  },
  {
    files: ['scripts/**/*.mjs'],
    languageOptions: { ecmaVersion: 2022, sourceType: 'module', globals: { console: 'readonly', process: 'readonly', setTimeout: 'readonly', clearTimeout: 'readonly' } }
  }
];

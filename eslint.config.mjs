import js from '@eslint/js'
import eslintConfigPrettier from 'eslint-config-prettier'
import globals from 'globals'

export default [
  {
    ignores: [
      'node_modules/**',
      'dist/**',
      'release/**',
      'vendor/**',
      'build/**',
      'assets/**',
      'coverage/**',
      'src/renderer/icon-review.html',
    ],
  },
  js.configs.recommended,
  {
    files: ['src/main/**/*.cjs', 'src/preload/**/*.cjs', 'tests/**/*.cjs', 'scripts/**/*.mjs'],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'commonjs',
      globals: {
        ...globals.node,
      },
    },
    rules: {
      'no-control-regex': 'off',
      'no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
    },
  },
  {
    files: ['scripts/**/*.mjs', 'eslint.config.mjs', 'playwright.config.mjs'],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'module',
      globals: {
        ...globals.node,
      },
    },
  },
  {
    files: ['src/renderer/**/*.js'],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'module',
      globals: {
        ...globals.browser,
      },
    },
    rules: {
      'no-restricted-globals': [
        'error',
        {
          name: 'prompt',
          message: 'Electron 不支持 window.prompt，请使用 openTextDialog。',
        },
      ],
      'no-restricted-properties': [
        'error',
        {
          object: 'window',
          property: 'prompt',
          message: 'Electron 不支持 window.prompt，请使用 openTextDialog。',
        },
      ],
      'no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
    },
  },
  {
    files: ['tests/e2e/**/*.mjs'],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'module',
      globals: {
        ...globals.node,
      },
    },
  },
  eslintConfigPrettier,
]

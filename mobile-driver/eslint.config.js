// Self-contained flat config. eslint-config-expo@8 predates flat config
// (no `/flat` export), so instead of extending it we wire the TypeScript
// parser/plugin directly — enough to enforce the one rule CLAUDE.md makes
// non-negotiable (zero `any`) plus the recommended TS rules. Type-aware
// checking is handled separately by `npm run typecheck` (tsc --noEmit).
const js = require('@eslint/js')
const tsParser = require('@typescript-eslint/parser')
const tsPlugin = require('@typescript-eslint/eslint-plugin')

module.exports = [
  { ignores: ['dist/*', '.expo/*', 'node_modules/*', 'babel.config.js', 'metro.config.js', 'tailwind.config.js', 'eslint.config.js'] },
  js.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      parser: tsParser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    plugins: { '@typescript-eslint': tsPlugin },
    rules: {
      ...tsPlugin.configs.recommended.rules,
      // Meryata Souq non-negotiable: zero `any` anywhere (CLAUDE.md).
      '@typescript-eslint/no-explicit-any': 'error',
      // TS + the compiler cover undefined-var checks; disable the base rule
      // that false-positives on JSX/global RN types.
      'no-undef': 'off',
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
]

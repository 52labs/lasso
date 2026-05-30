import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
    },
    rules: {
      // shadcn ui/* files intentionally co-export components and their cva
      // variants from one module; this rule is a dev-only HMR ergonomic, not a
      // correctness check, so it's off (the scaffold's own button.tsx trips it).
      'react-refresh/only-export-components': 'off',
      // The new compiler rule false-positives on data-fetching effects (our
      // dominant pattern: an effect kicks off an async load that setStates in a
      // later microtask, not synchronously). Off to avoid the noise.
      'react-hooks/set-state-in-effect': 'off',
    },
  },
])

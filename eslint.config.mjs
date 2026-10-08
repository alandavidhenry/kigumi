import js from '@eslint/js'
import nextPlugin from '@next/eslint-plugin-next'
import eslintConfigPrettier from 'eslint-config-prettier'
import importPlugin from 'eslint-plugin-import-x'
import pluginReact from 'eslint-plugin-react'
import pluginReactHooks from 'eslint-plugin-react-hooks'
import globals from 'globals'
import tseslint from 'typescript-eslint'

export default [
  // Ignore patterns
  {
    ignores: [
      'node_modules/**',
      'dist/**',
      '.next/**',
      'coverage/**',
      'eslint.config.mjs',
      '.vscode/**',
      'next-env.d.ts',
      'scripts/**',
      'src/generated/**',
      'playwright-report/**',
      'test-results/**'
    ]
  },

  // Base JS settings
  {
    ...js.configs.recommended,
    files: ['**/*.{js,mjs,cjs,ts,jsx,tsx}'],
  },

  // Globals + no-console for all files
  {
    files: ['**/*.{js,mjs,cjs,ts,jsx,tsx}'],
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node
      }
    },
    rules: {
      'no-console': ['warn', { allow: ['warn', 'error'] }]
    }
  },

  // TypeScript
  ...tseslint.configs.recommended,

  // React settings
  {
    files: ['**/*.{jsx,tsx}'],
    ...pluginReact.configs.flat.recommended,
    plugins: {
      react: pluginReact,
      'react-hooks': pluginReactHooks
    },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      'react/prop-types': 'off'
    },
    settings: {
      react: {
        version: 'detect'
      }
    }
  },

  // Next.js (full recommended ruleset)
  nextPlugin.configs['recommended'],

  // Import ordering
  {
    files: ['**/*.{js,mjs,cjs,ts,jsx,tsx}'],
    plugins: {
      import: importPlugin
    },
    rules: {
      'import/order': [
        'error',
        {
          groups: [
            'builtin',
            'external',
            'internal',
            'parent',
            'sibling',
            'index',
            'object',
            'type'
          ],
          pathGroups: [
            {
              pattern: '@/**',
              group: 'internal'
            }
          ],
          pathGroupsExcludedImportTypes: ['builtin', 'object'],
          'newlines-between': 'always',
          alphabetize: { order: 'asc', caseInsensitive: true }
        }
      ]
    }
  },

  // TypeScript-specific rules
  {
    files: ['**/*.{ts,tsx}'],
    rules: {
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_' }
      ]
    }
  },

  // Tenancy (ADR 0003): tenant data is reached only through src/lib, which
  // scopes every query with tenantDb(). Routes and components must not import
  // the raw Prisma client.
  {
    files: ['src/**/*.{ts,tsx}'],
    ignores: ['src/lib/**', 'src/**/__tests__/**', 'src/test/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: '@/lib/prisma',
              message:
                'Use a src/lib function that takes a TenantContext (tenantDb) instead of the raw Prisma client.'
            }
          ]
        }
      ]
    }
  },

  // Prettier — must be last to disable conflicting formatting rules
  eslintConfigPrettier
]

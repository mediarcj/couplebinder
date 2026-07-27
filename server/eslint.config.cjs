const js = require('@eslint/js');
const globals = require('globals');

const testGlobals = {
  describe: 'readonly',
  it: 'readonly',
  test: 'readonly',
  expect: 'readonly',
  beforeAll: 'readonly',
  afterAll: 'readonly',
  beforeEach: 'readonly',
  afterEach: 'readonly',
  vi: 'readonly'
};

module.exports = [
  {
    ignores: [
      'public/js/supabase-client.js',
      'public/js/**/*.min.js',
      'public/binder-editor/**',
      'ejs/**/*.ejs'
    ]
  },
  js.configs.recommended,
  {
    files: ['**/*.js', '**/*.cjs', '**/*.mjs'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'commonjs',
      globals: globals.node
    },
    rules: {
      'no-console': 'error',
      'no-control-regex': 'off',
      'no-empty': ['warn', { allowEmptyCatch: true }],
      'no-useless-escape': 'warn',
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-restricted-syntax': [
        'error',
        {
          selector: 'MemberExpression[object.name="req"][property.name="user"]',
          message:
            'Do not use req.user directly. Use assertUser(req), hasUser(req), getUserId(req), or getUserEmail(req) from utils/authz.js'
        }
      ],
      'no-restricted-properties': [
        'error',
        {
          object: 'process',
          property: 'env',
          message: 'Use { config } from server/config/index.js instead of process.env.'
        }
      ],
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'dotenv',
              message: 'Load dotenv only in server/config/index.js.'
            }
          ]
        }
      ]
    }
  },
  {
    files: ['**/__tests__/**', '**/*.test.js', 'tests/**/*.js'],
    languageOptions: {
      sourceType: 'module',
      globals: { ...globals.node, ...testGlobals }
    },
    rules: {
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-restricted-properties': 'off',
      'no-restricted-imports': 'off'
    }
  },
  {
    files: ['public/js/**/*.js'],
    languageOptions: { globals: globals.browser },
    rules: {
      'no-console': 'off',
      'no-undef': 'off'
    }
  },
  {
    files: ['vitest.config.js', 'test/**/*.mjs'],
    languageOptions: {
      sourceType: 'module',
      globals: globals.node
    },
    rules: {
      'no-restricted-properties': 'off',
      'no-restricted-imports': 'off'
    }
  },
  {
    files: [
      'zorvalon.js',
      'config/index.js',
      'core/moduleLoader.js',
      'middleware/authBridge.js',
      'utils/logger.js',
      'utils/submissionsQueue.js',
      'utils/supabaseClient.js',
      'lib/audit.js'
    ],
    rules: {
      'no-console': 'off',
      'no-restricted-properties': 'off'
    }
  },
  {
    files: ['scripts/**/*.js'],
    rules: {
      'no-console': 'off',
      'no-restricted-properties': 'off',
      'no-restricted-imports': 'off'
    }
  },
  {
    files: ['config/index.js'],
    rules: {
      'no-restricted-properties': 'off',
      'no-restricted-imports': 'off'
    }
  },
  {
    files: ['ui_contract/presenters.js'],
    rules: { 'no-constant-condition': 'off' }
  },
  {
    files: ['utils/consoleLogger.js'],
    rules: { 'no-console': 'off' }
  },
  {
    files: [
      'utils/authz.js',
      'middleware/authBridge.js',
      'middleware/requireAuth.js',
      'middleware/requireOwner.js',
      'middleware/requireAuthByDefault.js'
    ],
    rules: { 'no-restricted-syntax': 'off' }
  }
];

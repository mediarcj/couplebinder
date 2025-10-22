module.exports = {
  root: true,
  env: { node: true, es2022: true },
  extends: ['eslint:recommended'],
  parserOptions: { ecmaVersion: 2022 },
  ignorePatterns: [
    'public/js/supabase-client.js',
    'public/js/**/*.min.js'
  ],
  overrides: [
    // Test files: expose vitest globals
    {
      files: ['**/__tests__/**', '**/*.test.js', 'tests/**/*.js'],
      env: { node: true, es2022: true },
      parserOptions: { sourceType: 'module' },
      globals: {
        describe: 'readonly',
        it: 'readonly',
        test: 'readonly',
        expect: 'readonly',
        beforeAll: 'readonly',
        afterAll: 'readonly',
        beforeEach: 'readonly',
        afterEach: 'readonly',
        vi: 'readonly'
      },
      rules: {
        'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }]
      }
    },
    // Browser bundles
    {
      files: ['public/js/**/*.js'],
      env: { browser: true },
      rules: {
        'no-console': 'off',
        'no-undef': 'off'
      }
    },
    // TEMP: allow console in bootstrap while migrating to structured logger
    { files: ['zorvalon.js'], rules: { 'no-console': 'off' } },
    // Vitest config is ESM
    { files: ['vitest.config.js'], env: { node: true }, parserOptions: { sourceType: 'module' } },
    // TEMP: allow console in a few infra files until we swap to logger
    {
      files: [
        'config/index.js',
        'core/moduleLoader.js',
        'middleware/authBridge.js',
        'utils/logger.js',
        'utils/submissionsQueue.js',
        'utils/supabaseClient.js',
        'lib/audit.js'
      ],
      rules: { 'no-console': 'off' }
    },
    // CLI scripts need console output
    {
      files: ['scripts/**/*.js'],
      rules: { 'no-console': 'off' }
    },
    // TEMP: presenters has a deliberate constant condition guard
    {
      files: ['ui_contract/presenters.js'],
      rules: { 'no-constant-condition': 'off' }
    },
    // Keep consoleLogger as-is (utility that writes to console)
    { files: ['utils/consoleLogger.js'], rules: { 'no-console': 'off' } },
    // Auth utilities and middleware that legitimately access req.user
    {
      files: [
        'utils/authz.js',
        'middleware/authBridge.js',
        'middleware/requireAuth.js',
        'middleware/requireOwner.js'
      ],
      rules: { 'no-restricted-syntax': 'off' }
    }
  ],
  rules: {
    'no-console': 'error',
    'no-control-regex': 'off',
    'no-empty': ['warn', { allowEmptyCatch: true }],
    'no-useless-escape': 'warn',
    'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    'no-restricted-syntax': [
      'error',
      {
        'selector': 'MemberExpression[object.name="req"][property.name="user"]',
        'message': 'Do not use req.user directly. Use assertUser(req), hasUser(req), getUserId(req), or getUserEmail(req) from utils/authz.js'
      }
    ]
  }
};

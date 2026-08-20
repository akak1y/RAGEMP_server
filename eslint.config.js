const js = require('@eslint/js');
const globals = require('globals');

module.exports = [
    js.configs.recommended,
    {
        ignores: [
            '**/node_modules/**',
            '**/coverage/**',
            'client_packages/**',
            'UI-Server/**',
            'bin/**',
            '.dependency-cruiser.js',
        ],
    },
    {
        files: ['eslint.config.js'],
        languageOptions: {
            globals: { ...globals.node },
        },
    },
    {
        files: ['packages/main/**/*.js'],
        languageOptions: {
            ecmaVersion: 2023,
            sourceType: 'commonjs',
            globals: { ...globals.node, mp: 'writable' },
        },
        rules: {
            'no-unused-vars': [
                'warn',
                { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' },
            ],
            'no-empty': ['error', { allowEmptyCatch: true }],
        },
    },
    {
        files: ['packages/main/__tests__/**/*.js'],
        languageOptions: {
            globals: { ...globals.node, ...globals.jest, mp: 'writable' },
        },
    },
    {
        files: ['packages/main/websocket/admin/app.js'],
        languageOptions: {
            globals: { ...globals.browser, Vue: 'readonly', L: 'readonly' },
        },
    },
];

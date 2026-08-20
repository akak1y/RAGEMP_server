module.exports = {
    testEnvironment: 'node',
    setupFiles: ['<rootDir>/__tests__/integration/env.js'],
    globalSetup: '<rootDir>/__tests__/integration/setup.js',
    globalTeardown: '<rootDir>/__tests__/integration/teardown.js',
    testMatch: ['**/__tests__/integration/**/*.integration.test.js'],
    testTimeout: 30000,
    verbose: true,
};

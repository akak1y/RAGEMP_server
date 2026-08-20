module.exports = {
    testEnvironment: 'node',
    testMatch: ['**/__tests__/**/*.test.js'],
    testPathIgnorePatterns: ['/node_modules/', '<rootDir>/__tests__/integration/'],
    verbose: true,
    collectCoverageFrom: ['services/*.js'],
    coveragePathIgnorePatterns: ['node_modules']
};
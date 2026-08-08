module.exports = {
    testEnvironment: 'node',
    testMatch: ['**/__tests__/**/*.test.js'],
    verbose: true,
    collectCoverageFrom: ['packages/main/services/*.js'],
    coveragePathIgnorePatterns: ['node_modules']
};
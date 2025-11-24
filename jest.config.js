const path = require('path');

module.exports = {
  rootDir: path.resolve(__dirname),
  testEnvironment: 'node',
  setupFilesAfterEnv: [path.join(__dirname, 'tests', 'mocks', 'setupMocks.js')],
  testMatch: [
    '<rootDir>/tests/unit/**/*.test.js',
    '<rootDir>/tests/integration/**/*.test.js'
  ],
  collectCoverage: true,
  collectCoverageFrom: [
    'auth/**/*.js',
    'routes/**/*.js',
    'services/**/*.js',
    'utils/**/*.js',
    'stripe/**/*.js',
    'server-v2.js'
  ],
  coverageDirectory: '<rootDir>/coverage',
  clearMocks: true,
  resetMocks: true,
  restoreMocks: true,
  moduleDirectories: ['node_modules', '<rootDir>'],
  setupFiles: ['dotenv/config'],
  testPathIgnorePatterns: ['/node_modules/', '/tests/mocks/']
};


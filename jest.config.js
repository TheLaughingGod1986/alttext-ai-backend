const path = require('path');
const os = require('os');

module.exports = {
  rootDir: path.resolve(__dirname),
  roots: [path.join(__dirname, 'tests')],
  testEnvironment: 'node',
  setupFilesAfterEnv: [path.join(__dirname, 'tests', 'mocks', 'setupMocks.js')],
  testMatch: [
    '<rootDir>/tests/unit/**/*.test.js',
    '<rootDir>/tests/integration/**/*.test.js'
  ],
  collectCoverage: false,
  maxWorkers: 1,
  coverageProvider: 'v8',
  collectCoverageFrom: [
    'auth/**/*.js',
    'routes/**/*.js',
    'src/**/*.js',
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
  testPathIgnorePatterns: ['/node_modules/', '/tests/mocks/', '<rootDir>/coverage'],
  testTimeout: 10000, // 10 second timeout for tests
  // Performance optimizations for cloud-synced filesystem
  cache: false, // Disable caching to avoid I/O overhead on cloud drive
  watchman: false, // Disable watchman file watching
  cacheDirectory: path.join(os.tmpdir(), 'jest-cache-alttext')
};

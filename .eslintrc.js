module.exports = {
  env: {
    node: true,
    es2021: true,
    jest: true,
  },
  extends: [
    'eslint:recommended',
    'prettier',
  ],
  plugins: [],
  parserOptions: {
    ecmaVersion: 2021,
    sourceType: 'module',
  },
  rules: {
    // Warn on console usage (except console.warn/error which are acceptable for logging)
    'no-console': ['warn', { allow: ['warn', 'error'] }],
    // Error on unused variables
    'no-unused-vars': ['error', { 
      argsIgnorePattern: '^_',
      varsIgnorePattern: '^_',
    }],
    // Enforce prefer-const
    'prefer-const': 'error',
    // Disable rules that conflict with Prettier
    'indent': 'off',
    'linebreak-style': 'off',
    'quotes': 'off',
    'semi': 'off',
  },
  ignorePatterns: [
    'node_modules/',
    'coverage/',
    'dist/',
    'build/',
    '*.min.js',
  ],
};


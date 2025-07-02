const nx = require('@nx/eslint-plugin');
const baseConfig = require('../../../eslint.config.cjs');

module.exports = [
  ...baseConfig,
  ...nx.configs['flat/base'],
  ...nx.configs['flat/typescript'],
  ...nx.configs['flat/javascript'],
  {
    files: ['**/*.ts', '**/*.js'],
    rules: {
    },
  },
];

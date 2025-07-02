export default {
  displayName: 'util-functions',
  preset: '../../../jest.preset.js',
  coverageDirectory: '../../../coverage/util-functions',
  testEnvironment: 'node',
  transform: {
    '^.+\\.(ts|mjs|js|html)$': 'ts-jest',
  },
  transformIgnorePatterns: ['node_modules/(?!.*\\.mjs$)'],
};

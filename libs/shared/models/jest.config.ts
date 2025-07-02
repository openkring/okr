export default {
  displayName: 'shared/models',
  preset: '../../../jest.preset.js',
  coverageDirectory: '../../../coverage/libs/shared/models',
  testEnvironment: 'node',
  transform: {
    '^.+\\.(ts|mjs|js|html)$': 'ts-jest',
  },
  transformIgnorePatterns: ['node_modules/(?!.*\\.mjs$)'],
};

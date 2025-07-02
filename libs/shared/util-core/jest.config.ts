export default {
  displayName: 'shared/util-core',
  preset: '../../../jest.preset.js',
  coverageDirectory: '../../../coverage/libs/shared/util-core',
  testEnvironment: 'node',
  transform: {
    '^.+\\.(ts|mjs|js|html)$': 'ts-jest',
  },
  transformIgnorePatterns: ['node_modules/(?!.*\\.mjs$)'],
};

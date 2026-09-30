import nextJest from 'next/jest.js';

const createJestConfig = nextJest({ dir: './' });

export default createJestConfig({
  testEnvironment: 'jest-environment-jsdom',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    // jsdom would otherwise pick axios ESM browser build, which Jest cannot parse.
    '^axios$': 'axios/dist/node/axios.cjs',
  },
  modulePathIgnorePatterns: ['<rootDir>/.next/'],
  testMatch: ['<rootDir>/src/**/*.test.{ts,tsx}'],
});

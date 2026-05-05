module.exports = {
  extends: ['../.eslintrc.cjs'],
  parserOptions: { project: './tsconfig.json' },
  ignorePatterns: ['src/**/*.test.ts', 'src/test/**', 'scripts/**', 'lib/**'],
};

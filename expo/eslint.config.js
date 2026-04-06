const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ['dist/*'],
    linterOptions: {
      reportUnusedDisableDirectives: false,
    },
    rules: {
      'react/no-unescaped-entities': 'off',
      'react/display-name': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
      '@typescript-eslint/array-type': 'off',
      '@typescript-eslint/no-require-imports': 'off',
      'import/first': 'off',
      'import/no-duplicates': 'off',
      'import/no-named-as-default': 'off',
      'react-hooks/exhaustive-deps': 'off',
    },
  }
]);

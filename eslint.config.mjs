import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
  { ignores: ['**/dist/**', '**/.next/**', '**/coverage/**', '**/node_modules/**', '**/.venv/**', 'k6/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  prettier,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/consistent-type-imports': 'error',
    },
  },
  {
    // NestJS injects dependencies using constructor parameter types. With emitDecoratorMetadata,
    // those imports must stay real (value) imports, so this rule would break dependency injection.
    files: ['apps/{gateway,control-plane,worker}/**/*.ts'],
    rules: { '@typescript-eslint/consistent-type-imports': 'off' },
  },
);

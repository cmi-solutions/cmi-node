// @ts-check
import js from '@eslint/js';
import { defineConfig } from 'eslint/config';
import tseslint from 'typescript-eslint';

export default defineConfig(
    { ignores: ['dist/', 'node_modules/', 'coverage/'] },
    {
        files: ['src/**/*.ts'],
        extends: [js.configs.recommended, tseslint.configs.recommended],
        rules: {
            '@typescript-eslint/no-unused-vars': [
                'error',
                { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
            ],
            '@typescript-eslint/no-explicit-any': 'warn',
            '@typescript-eslint/no-non-null-assertion': 'warn',
            // All output goes through src/logger, which callers can silence or redirect.
            // A direct console call can leak payment data or secrets past that control.
            'no-console': 'error',
        },
    },
    {
        files: ['src/logger/**/*.ts'],
        rules: { 'no-console': 'off' },
    },
);

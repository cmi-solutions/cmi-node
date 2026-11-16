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
            // All output goes through src/shared/logger, which callers can silence or redirect.
            // A direct console call can leak payment data or secrets past that control.
            'no-console': 'error',
        },
    },
    {
        files: ['src/shared/logger/**/*.ts'],
        rules: { 'no-console': 'off' },
    },

    // ---- Architecture: kits are independent, shared code knows no kit ----------------
    // src/shared/**       may import only from src/shared.
    // src/kits/<kit>/**   may import from its own kit and from src/shared, never from another kit.
    // Code two kits need moves to src/shared.
    {
        files: ['src/shared/**/*.ts'],
        rules: {
            'no-restricted-imports': ['error', {
                patterns: [{
                    regex: '^@(standard|api|tokenization)(/|$)|(^|/)kits(/|$)',
                    message: 'src/shared must not import from a kit: move the code it needs to src/shared.',
                }],
            }],
        },
    },
    ...['standard', 'api', 'tokenization'].map((kit) => {
        const others = ['standard', 'api', 'tokenization'].filter((k) => k !== kit).join('|');
        return {
            files: [`src/kits/${kit}/**/*.ts`],
            rules: {
                'no-restricted-imports': ['error', {
                    patterns: [{
                        regex: `^@(${others})(/|$)|(^|/)kits/(${others})(/|$)|^\\.\\./(\\.\\./)*(${others})(/|$)`,
                        message: `The ${kit} kit must not import from another kit: move shared code to src/shared.`,
                    }],
                }],
            },
        };
    }),
);

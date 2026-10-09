// @ts-check
import js from '@eslint/js';
import globals from 'globals';
import astro from 'eslint-plugin-astro';
import tsParser from '@typescript-eslint/parser';

/**
 * Minimal lint: ESLint recommended rules only, no stylistic rules.
 * TypeScript files are covered by `npm run typecheck` (astro check), not by ESLint.
 */
export default [
    {
        ignores: [
            'dist/**',
            '.astro/**',
            'node_modules/**',
            'tests/fixtures/**',
            'src/generated/**',
            'src/content/docs/**',
            'concat_code.cjs',
            '**/*.ts',
        ],
    },
    js.configs.recommended,
    {
        files: ['**/*.{js,mjs,cjs}'],
        languageOptions: {
            ecmaVersion: 'latest',
            sourceType: 'module',
            globals: { ...globals.node, ...globals.browser },
        },
    },
    ...astro.configs['flat/recommended'],
    {
        // Astro frontmatter is TypeScript: the Astro parser delegates it to the TS parser.
        files: ['**/*.astro'],
        languageOptions: {
            parserOptions: { parser: tsParser, extraFileExtensions: ['.astro'] },
        },
    },
];

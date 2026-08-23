import { defineConfig, includeIgnoreFile } from 'eslint/config';
import { fileURLToPath } from 'node:url';
import tseslint from 'typescript-eslint';
import js from '@eslint/js';
import stylistic from '@stylistic/eslint-plugin';

export default defineConfig([
    includeIgnoreFile(fileURLToPath(new URL('.gitignore', import.meta.url)), { gitignoreResolution: true }),

    {
        // files: [ '**/*.ts' ],

        languageOptions: {
            parser: tseslint.parser,
            ecmaVersion: 'latest',
            sourceType: 'module',
            parserOptions: {
                projectService: 'true',
            },
        },

        plugins: {
            js,
            '@stylistic': stylistic,
            '@typescript-eslint': tseslint.plugin,
        },

        extends: [
            js.configs.recommended,
            tseslint.configs.recommended,
        ],

        rules: {
            'no-eval': [ 'error' ],
            'no-warning-comments': [ 'warn', {
                terms: [ 'TODO', 'FIXME', 'NICE_TO_HAVE' ],
            } ],
            'curly': [ 'warn', 'multi-or-nest', 'consistent' ],

            // Replaced by the @typescript-eslint rules.
            'no-unused-vars': 'off',
            'no-empty-function': 'off',

            '@stylistic/semi': [ 'error', 'always' ],
            '@stylistic/indent': [ 'warn', 4, {
                ignoredNodes: [
                    // A workaround for decorators. Not ideal, though.
                    'FunctionExpression > .params[decorators.length > 0]',
                    'FunctionExpression > .params > :matches(Decorator, :not(:first-child))',
                    'ClassBody.body > PropertyDefinition[decorators.length > 0] > .key',
                ],
            } ],
            '@stylistic/array-bracket-spacing': [ 'warn', 'always' ],
            '@stylistic/object-curly-spacing': [ 'warn', 'always' ],
            '@stylistic/space-before-function-paren': [ 'warn', {
                anonymous: 'always',
                named: 'never',
                asyncArrow: 'always',
            } ],
            '@stylistic/brace-style': [ 'warn', 'stroustrup' ],
            '@stylistic/nonblock-statement-body-position': [ 'error', 'below' ],
            '@stylistic/comma-dangle': [ 'warn', 'always-multiline' ],
            '@stylistic/quotes': [ 'warn', 'single', {
                allowTemplateLiterals: 'always',
            } ],
            '@stylistic/arrow-parens': [ 'warn', 'as-needed' ],
            '@stylistic/member-delimiter-style': [ 'error', {
                singleline: {
                    delimiter: 'comma',
                },
            } ],
            '@stylistic/space-infix-ops': [ 'warn' ],
            '@stylistic/keyword-spacing': [ 'warn' ],

            // TypeScript
            '@typescript-eslint/no-unused-vars': [ 'error', {} ],
            '@typescript-eslint/no-empty-function': [ 'warn', {
                allow: [ 'private-constructors' ],
            } ],
            '@typescript-eslint/consistent-type-imports': [ 'error', {
                fixStyle: 'inline-type-imports',
            } ],
            '@typescript-eslint/no-explicit-any': [ 'warn' ],
            '@typescript-eslint/unbound-method': [ 'error', {
                ignoreStatic: true,
            } ],
            '@typescript-eslint/no-misused-promises': [ 'error', {
                checksVoidReturn: false,
            } ],
            '@typescript-eslint/no-floating-promises': 'error',
        },
    },
]);

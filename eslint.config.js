import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import svelte from 'eslint-plugin-svelte';

export default tseslint.config(
	{
		ignores: [
			'.svelte-kit/**',
			'build/**',
			'dist/**',
			'node_modules/**',
			'src-tauri/**',
			'test-results/**',
			'playwright-report/**',
			'*.config.js'
		]
	},
	js.configs.recommended,
	...tseslint.configs.recommended,
	...svelte.configs['flat/recommended'],
	{
		languageOptions: {
			globals: { ...globals.browser, ...globals.node }
		}
	},
	{
		files: ['**/*.svelte'],
		languageOptions: {
			parserOptions: { parser: tseslint.parser }
		}
	},
	{
		// runes modules (.svelte.ts/js) need the TS parser inside the svelte parser
		files: ['**/*.svelte.ts', '**/*.svelte.js'],
		languageOptions: {
			parserOptions: { parser: tseslint.parser }
		}
	},
	{
		rules: {
			'@typescript-eslint/no-unused-vars': [
				'error',
				{ argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' }
			]
		}
	},
	{
		// Architecture rule (§M1-12): all store mutations go through commands.
		files: ['src/**/*.{ts,svelte}'],
		ignores: ['src/lib/canvas/**', 'src/lib/tools/**', '**/*.test.ts'],
		rules: {
			'no-restricted-syntax': [
				'error',
				{
					selector:
						"CallExpression[callee.property.name=/^(add|addMany|remove|removeMany|update)$/][callee.object.name='store']",
					message: 'Mutate the store through engine.execute/commands, not directly.'
				},
				{
					selector:
						"CallExpression[callee.property.name=/^(add|addMany|remove|removeMany|update)$/][callee.object.property.name='store']",
					message: 'Mutate the store through engine.execute/commands, not directly.'
				}
			]
		}
	}
);

import base from '@rollover-desk/config/eslint';

const outer = ['**/interfaces/**', '**/infrastructure/**'];

/** The dependency rule of ports and adapters: arrows point inward, and only server.ts wires adapters. */
export default [
  ...base,
  {
    files: ['src/domain/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              regex: '^(?!\\./|\\.\\./(entities|ports)/)',
              message: 'domain imports nothing outside itself.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['src/application/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [...outer, 'express', 'kysely', 'better-sqlite3', 'pg', 'exceljs'],
              message: 'application imports only domain.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['src/interfaces/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/infrastructure/**', 'kysely', 'better-sqlite3', 'pg', 'exceljs'],
              message: 'Only server.ts wires concrete adapters.',
            },
          ],
        },
      ],
    },
  },
];

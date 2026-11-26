export default [
  {
    files: ['**/*.js'],
    rules: {
      'no-restricted-syntax': ['error',
        { selector: 'CallExpression[callee.name=allowed]', message: 'allowed selector' },
        { selector: 'CallExpression[callee.name=banned]', message: 'banned selector' },
      ],
    },
  },
]

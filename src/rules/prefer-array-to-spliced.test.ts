import {RuleTester} from 'eslint';
import {RuleTester as TSRuleTester} from '@typescript-eslint/rule-tester';
import {preferArrayToSpliced} from './prefer-array-to-spliced.js';
import * as path from 'node:path';
import {fileURLToPath} from 'node:url';

const rootDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..'
);
const typedRuleTester = new TSRuleTester({
  languageOptions: {
    parserOptions: {
      projectService: {
        allowDefaultProject: ['*.ts'],
        defaultProject: './tsconfig.json'
      },
      tsconfigRootDir: rootDir
    }
  }
});
const ruleTester = new RuleTester({
  languageOptions: {
    ecmaVersion: 2022,
    sourceType: 'module'
  }
});

ruleTester.run(
  'prefer-array-to-spliced (untyped)',
  preferArrayToSpliced as never,
  {
    valid: [
      'arr.splice(0, 1);',
      'const modified = arr.splice(2, 3);',

      // chained splice returns the removed elements, not the spliced copy
      'const removed = arr.concat().splice(0, 1);',
      'const removed = arr.slice().splice(1, 2);',
      'const removed = [...arr].splice(2, 3);',
      'function foo() { return [...this.items].splice(1, 2); }',

      // not a copy
      'const copy = arr; copy.splice(0, 1);',
      'const copy = arr.slice(1); copy.splice(0, 1);',

      // code between the copy and the splice
      'const copy = arr.slice(); foo(copy); copy.splice(0, 1);',
      'const copy = arr.slice(); bar(); copy.splice(0, 1);',

      // splicing a different variable
      'const copy = arr.slice(); other.splice(0, 1);',

      // splice result is used
      'const copy = arr.slice(); const removed = copy.splice(0, 1);',
      'function foo() { const copy = arr.slice(); return copy.splice(0, 1); }',

      // optional or computed splice
      'const copy = arr.slice(); copy?.splice(0, 1);',
      "const copy = arr.slice(); copy['splice'](0, 1);",

      // multiple declarators or destructuring
      'const copy = arr.slice(), other = 1; copy.splice(0, 1);',
      'const [copy] = [arr.slice()]; copy.splice(0, 1);',

      // arguments reference the copy
      'const copy = arr.slice(); copy.splice(copy.length - 1, 1);',
      'const copy = [...arr]; copy.splice(copy.indexOf(x), 1);',

      // copy may be undefined, the original throws instead
      'const copy = obj.arr?.slice(); copy.splice(0, 1);',

      // spreading non-array iterables
      'const copy = [...new Set(arr)]; copy.splice(0, 1);',
      'const seen = new Set(); const copy = [...seen]; copy.splice(0, 1);',
      'const copy = [...items.entries()]; copy.splice(0, 1);'
    ],

    invalid: [
      {
        code: 'const copy = arr.slice(); copy.splice(1, 2);',
        output: 'const copy = arr.toSpliced(1, 2);',
        errors: [
          {
            messageId: 'preferToSpliced',
            data: {array: 'arr'},
            line: 1,
            column: 27
          }
        ]
      },
      {
        code: 'const copy = arr.slice(0); copy.splice(0, 1);',
        output: 'const copy = arr.toSpliced(0, 1);',
        errors: [{messageId: 'preferToSpliced', data: {array: 'arr'}}]
      },
      {
        code: 'const copy = arr.concat(); copy.splice(0, 1);',
        output: 'const copy = arr.toSpliced(0, 1);',
        errors: [{messageId: 'preferToSpliced', data: {array: 'arr'}}]
      },
      {
        code: 'let copy = [...arr]; copy.splice(2, 3);',
        output: 'let copy = arr.toSpliced(2, 3);',
        errors: [{messageId: 'preferToSpliced', data: {array: 'arr'}}]
      },
      {
        code: 'var copy = arr.slice(); copy.splice(1);',
        output: 'var copy = arr.toSpliced(1);',
        errors: [{messageId: 'preferToSpliced', data: {array: 'arr'}}]
      },

      // inserting items
      {
        code: "const copy = arr.slice(); copy.splice(1, 2, 'a', 'b');",
        output: "const copy = arr.toSpliced(1, 2, 'a', 'b');",
        errors: [{messageId: 'preferToSpliced', data: {array: 'arr'}}]
      },
      {
        code: 'const copy = arr.slice(); copy.splice(...args);',
        output: 'const copy = arr.toSpliced(...args);',
        errors: [{messageId: 'preferToSpliced', data: {array: 'arr'}}]
      },

      // multiline
      {
        code: `
          const copy = arr.slice();
          copy.splice(1, 2);
          console.log(copy);
        `,
        output: `
          const copy = arr.toSpliced(1, 2);
          console.log(copy);
        `,
        errors: [
          {
            messageId: 'preferToSpliced',
            data: {array: 'arr'},
            line: 3,
            column: 11
          }
        ]
      },

      // inside a function
      {
        code: 'function foo() { const copy = [...this.items]; copy.splice(1, 2); return copy; }',
        output:
          'function foo() { const copy = this.items.toSpliced(1, 2); return copy; }',
        errors: [{messageId: 'preferToSpliced', data: {array: 'this.items'}}]
      },

      // inside a switch case
      {
        code: 'switch (x) { case 1: const copy = arr.slice(); copy.splice(0, 1); break; }',
        output:
          'switch (x) { case 1: const copy = arr.toSpliced(0, 1); break; }',
        errors: [{messageId: 'preferToSpliced', data: {array: 'arr'}}]
      },

      // comments before the splice are kept
      {
        code: `
          const copy = arr.slice(); // copy it
          // drop the first item
          copy.splice(0, 1);
        `,
        output: `
          const copy = arr.toSpliced(0, 1); // copy it
          // drop the first item
        `,
        errors: [{messageId: 'preferToSpliced', data: {array: 'arr'}}]
      },

      // no semicolons
      {
        code: `
          const copy = arr.slice()
          copy.splice(0, 1)
          foo()
        `,
        output: `
          const copy = arr.toSpliced(0, 1)
          foo()
        `,
        errors: [{messageId: 'preferToSpliced', data: {array: 'arr'}}]
      },

      // semicolon only on the splice is moved to the declaration
      {
        code: `
          const copy = arr.slice()
          copy.splice(0, 1);
          [a, b] = [b, a]
        `,
        output: `
          const copy = arr.toSpliced(0, 1);
          [a, b] = [b, a]
        `,
        errors: [{messageId: 'preferToSpliced', data: {array: 'arr'}}]
      },
      {
        code: `
          const copy = arr.slice() // copy it
          copy.splice(0, 1);
        `,
        output: `
          const copy = arr.toSpliced(0, 1); // copy it
        `,
        errors: [{messageId: 'preferToSpliced', data: {array: 'arr'}}]
      },

      // complex expressions
      {
        code: 'const copy = obj.data.items.slice(); copy.splice(0, 1);',
        output: 'const copy = obj.data.items.toSpliced(0, 1);',
        errors: [
          {messageId: 'preferToSpliced', data: {array: 'obj.data.items'}}
        ]
      },
      {
        code: 'const copy = [...a ?? b]; copy.splice(0, 1);',
        output: 'const copy = (a ?? b).toSpliced(0, 1);',
        errors: [{messageId: 'preferToSpliced', data: {array: 'a ?? b'}}]
      },

      // Object.entries() returns an array
      {
        code: 'const copy = [...Object.entries(obj)]; copy.splice(0, 1);',
        output: 'const copy = Object.entries(obj).toSpliced(0, 1);',
        errors: [
          {messageId: 'preferToSpliced', data: {array: 'Object.entries(obj)'}}
        ]
      }
    ]
  }
);

typedRuleTester.run('prefer-array-to-spliced (typed)', preferArrayToSpliced, {
  valid: [
    `
      declare const mySet: Set<number>;
      const copy = [...mySet];
      copy.splice(0, 1);
    `,
    `
      declare const iter: Iterable<number>;
      const copy = [...iter];
      copy.splice(0, 1);
    `
  ],
  invalid: [
    {
      code: `
        declare const arr: number[];
        const copy: number[] = [...arr];
        copy.splice(0, 1);
      `,
      output: `
        declare const arr: number[];
        const copy: number[] = arr.toSpliced(0, 1);
      `,
      errors: [{messageId: 'preferToSpliced', data: {array: 'arr'}}]
    }
  ]
});

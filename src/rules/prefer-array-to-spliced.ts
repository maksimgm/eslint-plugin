import type {TSESLint, TSESTree} from '@typescript-eslint/utils';
import {
  getArrayFromCopyPattern,
  formatArguments,
  needsParensForPropertyAccess,
  resolvesToKnownNonArrayCopySource
} from '../utils/ast.js';
import {isArrayType} from '../utils/typescript.js';

type MessageIds = 'preferToSpliced';

function getSiblingStatements(
  node: TSESTree.Node
): readonly TSESTree.Node[] | null {
  const parent = node.parent;
  switch (parent?.type) {
    case 'Program':
    case 'BlockStatement':
    case 'StaticBlock':
      return parent.body;
    case 'SwitchCase':
      return parent.consequent;
    default:
      return null;
  }
}

export const preferArrayToSpliced: TSESLint.RuleModule<MessageIds, []> = {
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Prefer Array.prototype.toSpliced() over copying and splicing arrays'
    },
    fixable: 'code',
    schema: [],
    messages: {
      preferToSpliced:
        'Use {{array}}.toSpliced() instead of copying and splicing'
    }
  },
  defaultOptions: [],
  create(context) {
    const sourceCode = context.sourceCode;

    return {
      // matches `const copy = arr.slice(); copy.splice(...);`
      // `[...arr].splice()` on its own returns the removed elements, which
      // isn't what `toSpliced()` returns, so only copy-then-splice is reported
      'ExpressionStatement > CallExpression.expression'(
        node: TSESTree.CallExpression
      ) {
        const callee = node.callee;
        if (
          callee.type !== 'MemberExpression' ||
          callee.optional ||
          callee.computed ||
          callee.property.type !== 'Identifier' ||
          callee.property.name !== 'splice' ||
          callee.object.type !== 'Identifier'
        ) {
          return;
        }

        const statement = node.parent as TSESTree.ExpressionStatement;
        const siblings = getSiblingStatements(statement);
        if (!siblings) {
          return;
        }

        const declaration = siblings[siblings.indexOf(statement) - 1];
        if (
          declaration?.type !== 'VariableDeclaration' ||
          declaration.declarations.length !== 1 ||
          !['const', 'let', 'var'].includes(declaration.kind)
        ) {
          return;
        }

        const declarator = declaration.declarations[0]!;
        if (
          declarator.id.type !== 'Identifier' ||
          declarator.id.name !== callee.object.name ||
          !declarator.init
        ) {
          return;
        }

        const init = declarator.init;
        const arrayNode = getArrayFromCopyPattern(init);
        if (!arrayNode) {
          return;
        }

        // `copy.splice(copy.length - 1)` would read `copy` before it exists
        const [variable] = sourceCode.getDeclaredVariables(declarator);
        if (
          variable?.references.some(
            (ref) =>
              ref.identifier.range[0] > callee.range[1] &&
              ref.identifier.range[1] <= node.range[1]
          )
        ) {
          return;
        }

        const arrayType = isArrayType(arrayNode, context);
        if (arrayType === false) {
          return;
        }

        if (
          !arrayType &&
          resolvesToKnownNonArrayCopySource(arrayNode, context)
        ) {
          return;
        }

        const rawText = sourceCode.getText(arrayNode);
        const arrayText = needsParensForPropertyAccess(arrayNode)
          ? `(${rawText})`
          : rawText;
        const argsText = formatArguments(node.arguments, sourceCode);

        context.report({
          node,
          messageId: 'preferToSpliced',
          data: {
            array: rawText
          },
          *fix(fixer) {
            yield fixer.replaceText(
              init,
              `${arrayText}.toSpliced(${argsText})`
            );

            // keep the splice's semicolon so ASI doesn't join the next line
            const lastToken = sourceCode.getLastToken(declaration);
            const statementLastToken = sourceCode.getLastToken(statement);
            if (lastToken?.value !== ';' && statementLastToken?.value === ';') {
              yield fixer.insertTextAfter(declaration, ';');
            }

            // remove the splice statement, keeping any comments before it
            const tokenBefore = sourceCode.getTokenBefore(statement, {
              includeComments: true
            })!;
            yield fixer.removeRange([tokenBefore.range[1], statement.range[1]]);
          }
        });
      }
    };
  }
};

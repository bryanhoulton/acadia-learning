import type {
  Code,
  Text,
} from 'mdast';
import remarkMath from 'remark-math';
import remarkParse from 'remark-parse';
import { unified } from 'unified';
import { visitParents } from 'unist-util-visit-parents';

import { exps } from './common_latex';
import { markdown_exps } from './common_markdown';

type ValidationError = string | string[] | null | undefined;

export function mergeErrors(errors: ValidationError[]): string {
  return errors
    .map((error) => {
      if (Array.isArray(error)) {
        return error.join("\n");
      }
      return error;
    })
    .filter((error) => error !== null && error !== undefined)
    .join("\n");
}

type Rule = {
  name: string;
  type: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  validate: (node: any, ancestors: any[]) => ValidationError;
};

const rules: Rule[] = [
  {
    name: "No LaTeX in text",
    type: "text",
    validate: (node: Text) => {
      const errors: ValidationError = [];
      for (const [exp, error] of exps) {
        const match = node.value.match(exp);
        if (match) {
          errors.push(
            `${error} at line ${node.position?.start.line}: ${match}`
          );
        }
      }
      return errors;
    },
  },
  {
    name: "Markdown in code block",
    type: "code",
    validate: (node: Code) => {
      const errors: ValidationError = [];
      for (const [exp, error] of markdown_exps) {
        const match = node.value.match(exp);
        if (match) {
          errors.push(
            `${error} at line ${node.position?.start.line}: ${match}`
          );
        }
      }
      return errors;
    },
  },
];

export async function validateMarkdown(value: string) {
  const tree = unified().use(remarkParse).use(remarkMath).parse(value);
  const validationErrors: ValidationError[] = [];

  visitParents(tree, (node, ancestors) => {
    const rule = rules.find((rule) => rule.type === node.type);
    if (rule) {
      const error = rule.validate(node, ancestors);
      if (error && !(Array.isArray(error) && error.length === 0)) {
        validationErrors.push(error);
      }
    }
  });

  return validationErrors;
}

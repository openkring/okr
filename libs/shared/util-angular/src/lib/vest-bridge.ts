import { FieldTree, TreeValidationResult, validateTree } from '@angular/forms/signals';
import type { StaticSuite } from 'vest';

function resolveFieldTree(root: FieldTree<unknown>, key: string): FieldTree<unknown> | undefined {
  if (!key) return root;
  return key
    .replace(/\[(\d+)\]/g, '.$1')
    .split('.')
    .reduce((node: any, segment) => (node == null ? node : node[segment]), root) as FieldTree<unknown> | undefined;
}

export function validateVestTree<T>(
  path: any,
  suite: StaticSuite<string, string, (model: T, field?: string) => void>,
): void {
  validateTree(path, (ctx): TreeValidationResult => {
    const result = suite(ctx.value() as T);
    const fieldErrors = result.getErrors();
    const errors: { kind: string; message: string; fieldTree: FieldTree<unknown> }[] = [];

    for (const [key, messages] of Object.entries(fieldErrors)) {
      const fieldTree = resolveFieldTree(ctx.fieldTree, key);
      if (!fieldTree) continue;
      for (const message of messages) {
        errors.push({ kind: `vest.${key}`, message, fieldTree });
      }
    }

    return errors.length ? errors : undefined;
  });
}

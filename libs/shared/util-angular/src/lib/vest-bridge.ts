import { FieldTree, SchemaPath, TreeValidationResult, validateTree } from '@angular/forms/signals';
import type { StaticSuite } from 'vest';

function resolveFieldTree(root: FieldTree<unknown>, key: string): FieldTree<unknown> | undefined {
  if (!key) return root;
  return key
    .replace(/\[(\d+)\]/g, '.$1')
    .split('.')
    .reduce((node: any, segment) => {
      if (node == null) return node;
      const k = /^\d+$/.test(segment) ? parseInt(segment, 10) : segment;
      return node[k];
    }, root) as FieldTree<unknown> | undefined;
}

/**
 * Angular Signal Forms bridge for synchronous Vest validation suites.
 *
 * Only use with `staticSuite` — async vest `test(() => Promise)` tests will silently
 * produce no errors because `.getErrors()` reads the synchronous snapshot.
 */
export function validateVestTree<T>(
  path: SchemaPath<T>,
  suite: StaticSuite<string, string, (model: T, field?: string) => void>,
): void {
  validateTree(path, (ctx): TreeValidationResult => {
    const result = suite(ctx.value() as T);
    const fieldErrors = result.getErrors();
    const errors: { kind: string; message: string; fieldTree: FieldTree<unknown> }[] = [];

    for (const [key, messages] of Object.entries(fieldErrors)) {
      const fieldTree = resolveFieldTree(ctx.fieldTree, key);
      if (!fieldTree) {
        if (typeof ngDevMode !== 'undefined' && ngDevMode) {
          console.warn(`[vest-bridge] No FieldTree node for Vest key "${key}". Error dropped.`);
        }
        continue;
      }
      for (const message of messages) {
        errors.push({ kind: `vest.${key}`, message, fieldTree });
      }
    }

    return errors.length ? errors : undefined;
  });
}

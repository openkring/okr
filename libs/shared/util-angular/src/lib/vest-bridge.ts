import { computed, Signal } from '@angular/core';
import { FieldTree, SchemaPath, TreeValidationResult, validateTree } from '@angular/forms/signals';
import type { StaticSuite } from 'vest';

/** prefix of the error kind the bridge files each Vest key under; vestErrors() strips it again */
const VEST_KIND = 'vest.';

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
  suite: StaticSuite<string, string, (model: T) => void>,
): void {
  validateTree(path, (ctx): TreeValidationResult => {
    const result = suite(ctx.value() as T);
    const fieldErrors = result.getErrors();
    const errors: { kind: string; message: string; fieldTree: FieldTree<unknown> }[] = [];

    for (const [key, messages] of Object.entries(fieldErrors)) {
      // A key without a FieldTree node (a field missing on a legacy doc, a cross-field rule name)
      // lands on the root: dropping it would let the form report valid while the suite fails.
      const fieldTree = resolveFieldTree(ctx.fieldTree, key) ?? ctx.fieldTree;
      for (const message of messages) {
        errors.push({ kind: VEST_KIND + key, message, fieldTree });
      }
    }

    return errors.length ? errors : undefined;
  });
}

/** The read side of the bridge: the same lookups as a Vest result, for the per-field error notes. */
export interface VestErrors {
  getErrors(): Record<string, string[]>;
  getErrors(key: string): string[];
  /** true when no Vest error is left anywhere in the form */
  isValid(): boolean;
}

/**
 * The Vest errors of a signal form built with {@link validateVestTree}, regrouped by Vest key.
 *
 * Read the error notes from here instead of calling the suite a second time: the suite then runs
 * once per change (inside the bridge), and the notes can never disagree with the form's validity —
 * a second call with different context arguments used to make exactly that possible.
 * Errors the bridge had to park on the root (no FieldTree node) keep their original key.
 */
export function vestErrors<T>(tree: FieldTree<T>): Signal<VestErrors> {
  return computed(() => {
    const byKey: Record<string, string[]> = {};
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const error of (tree as any)().errorSummary() as { kind: string; message?: string }[]) {
      if (!error.kind.startsWith(VEST_KIND)) continue;
      const key = error.kind.slice(VEST_KIND.length);
      (byKey[key] ??= []).push(error.message ?? '');
    }
    const getErrors = ((key?: string) => (key === undefined ? byKey : (byKey[key] ?? []))) as VestErrors['getErrors'];
    const isValid = () => Object.keys(byKey).length === 0;
    return { getErrors, isValid };
  });
}

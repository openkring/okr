import { provideZonelessChangeDetection, runInInjectionContext, signal, type ApplicationRef } from '@angular/core';
import { createApplication } from '@angular/platform-browser';
import { form } from '@angular/forms/signals';
import { enforce, only, staticSuite, test } from 'vest';
import { afterEach, describe, expect, it } from 'vitest';

import { validateVestTree } from './vest-bridge';

/**
 * `resolveFieldTree` in vest-bridge.ts SILENTLY DROPS any Vest error key it cannot resolve onto
 * the Angular `FieldTree` (a `console.warn` under `ngDevMode`, nothing thrown) — a form that
 * looks INVALID to Vest would then report VALID to Angular, and a user could save invalid data
 * with no visible error and no change-confirmation bar. `workflow-rule.form.ts` (system/workflow/ui)
 * is the first place in this codebase to push a bracketed array key (`steps[0].messageKey`)
 * through this bridge, so this spec proves the array path end to end against the REAL
 * `@angular/forms/signals` `form()` — not a hand-rolled fake of `FieldTree`, which would prove
 * nothing about the framework's actual array-indexing behaviour.
 */

interface Step {
  messageKey: string;
}

interface Model {
  name: string;
  steps: Step[];
}

/** Mirrors the shape of workflow-rule.validations.ts: one root-key error, one bracketed-array-key error. */
const suite = staticSuite((model: Model, field?: string) => {
  if (field) only(field);
  test('name', 'required', () => { enforce(model.name).isNotBlank(); });
  model.steps.forEach((s, i) => {
    test(`steps[${i}].messageKey`, 'required', () => { enforce(s.messageKey).isNotBlank(); });
  });
});

/**
 * A real Angular environment injector, via `createApplication` — NOT `TestBed`. `form()` needs a
 * genuine injection context (it injects `Injector` internally); `TestBed.configureTestingModule`
 * compiles a test NgModule and is unnecessary ceremony for a form built from a plain signal, so
 * this follows the same narrow `createApplication` pattern already used in this repo for
 * signal-based constructs that need a real injector (see feature-enabled.guard.spec.ts).
 */
async function makeAppRef(): Promise<ApplicationRef> {
  return createApplication({ providers: [provideZonelessChangeDetection()] });
}

describe('validateVestTree — array path through a real Angular Signal Forms form()', () => {
  let appRef: ApplicationRef | undefined;

  afterEach(() => {
    appRef?.destroy();
    appRef = undefined;
  });

  it('attaches a root-key error to the form (proves the harness works at all)', async () => {
    appRef = await makeAppRef();
    const model = signal<Model>({ name: '', steps: [{ messageKey: 'ok' }] });

    const tree = runInInjectionContext(appRef.injector, () =>
      form(model, (path) => validateVestTree(path, suite)),
    );
    appRef.tick();

    expect(tree().valid()).toBe(false);
    expect(tree.name().valid()).toBe(false);
    expect(tree.name().errors().length).toBeGreaterThan(0);
  });

  it('resolves a bracketed steps[0].messageKey Vest error onto the array element field, not dropped', async () => {
    appRef = await makeAppRef();
    const model = signal<Model>({ name: 'Kategoriewechsel', steps: [{ messageKey: '' }] });

    const tree = runInInjectionContext(appRef.injector, () =>
      form(model, (path) => validateVestTree(path, suite)),
    );
    appRef.tick();

    // if resolveFieldTree failed to walk 'steps[0].messageKey' onto the FieldTree, this whole
    // form would report valid — the exact silent-drop failure mode this spec exists to catch.
    expect(tree().valid()).toBe(false);
    expect(tree.steps[0].messageKey().valid()).toBe(false);
    expect(tree.steps[0].messageKey().errors().length).toBeGreaterThan(0);
  });
});

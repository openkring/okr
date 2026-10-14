import { describe, expect, it, vi } from 'vitest';
import { ActionSheetOptions } from '@ionic/angular/lazy';

import { ActionSheetControllerLike, ActionSheetEntry, flattenActionSheetEntries, selectNestedAction } from './action-sheet.util';

vi.mock('@okr/shared-util-core', () => ({
  getSvgIconUrl: (base: string, name: string) => `${base}/${name}.svg`
}));

const view = { action: 'ownership.view', text: 'anzeigen', icon: 'eye-on' };
const edit = { action: 'ownership.edit', text: 'ändern', icon: 'edit' };

/** A fake controller that answers each presented sheet with the next queued action. */
function fakeController(answers: (string | undefined)[]): ActionSheetControllerLike & { shown: ActionSheetOptions[] } {
  const shown: ActionSheetOptions[] = [];
  return {
    shown,
    create: async (opts: ActionSheetOptions) => {
      shown.push(opts);
      const action = answers.shift();
      return {
        present: async () => undefined,
        onDidDismiss: async () => ({ data: action ? { action } : undefined })
      };
    }
  };
}

describe('flattenActionSheetEntries', () => {
  it('drops empty groups', () => {
    expect(flattenActionSheetEntries([{ text: 'Nutzung', actions: [] }])).toEqual([]);
  });

  it('moves the only action of a group up to level 1 with a combined label', () => {
    expect(flattenActionSheetEntries([{ text: 'Nutzung', actions: [view] }])).toEqual([
      { action: 'ownership.view', text: 'Nutzung anzeigen', icon: 'eye-on' }
    ]);
  });

  it('keeps groups with several actions and plain actions as they are', () => {
    const entries: ActionSheetEntry[] = [
      { text: 'Nutzung', actions: [view, edit] },
      { action: 'owner.view', text: 'Nutzer/in anzeigen' }
    ];
    expect(flattenActionSheetEntries(entries)).toEqual(entries);
  });

  it('uses the given label combiner', () => {
    const result = flattenActionSheetEntries([{ text: 'usage', actions: [view] }], (g, a) => `${a} ${g}`);
    expect(result[0]).toMatchObject({ text: 'anzeigen usage' });
  });
});

describe('selectNestedAction', () => {
  it('shows nothing when there is nothing to offer', async () => {
    const controller = fakeController([]);
    expect(await selectNestedAction(controller, 'Aktionen', [], 'Abbrechen', 'base')).toBeUndefined();
    expect(controller.shown).toHaveLength(0);
  });

  it('returns a level-1 action directly', async () => {
    const controller = fakeController(['owner.view']);
    const result = await selectNestedAction(controller, 'Aktionen', [{ action: 'owner.view', text: 'Nutzer/in anzeigen' }], 'Abbrechen', 'base');
    expect(result).toBe('owner.view');
    expect(controller.shown).toHaveLength(1);
    expect(controller.shown[0].buttons.map(b => typeof b === 'string' ? b : b.text)).toEqual(['Nutzer/in anzeigen', 'Abbrechen']);
  });

  it('opens the second level for a group and returns the action chosen there', async () => {
    const controller = fakeController(['group.0', 'ownership.edit']);
    const result = await selectNestedAction(controller, 'Aktionen', [{ text: 'Nutzung', actions: [view, edit] }], 'Abbrechen', 'base');
    expect(result).toBe('ownership.edit');
    expect(controller.shown).toHaveLength(2);
    expect(controller.shown[0].buttons.map(b => typeof b === 'string' ? b : b.text)).toEqual(['Nutzung…', 'Abbrechen']);
    expect(controller.shown[1].header).toBe('Nutzung');
    expect(controller.shown[1].buttons.map(b => typeof b === 'string' ? b : b.text)).toEqual(['… anzeigen', '… ändern', 'Abbrechen']);
  });

  it('resolves to undefined when cancelled on either level', async () => {
    const entries: ActionSheetEntry[] = [{ text: 'Nutzung', actions: [view, edit] }];
    expect(await selectNestedAction(fakeController(['cancel']), 'A', entries, 'Abbrechen', 'base')).toBeUndefined();
    expect(await selectNestedAction(fakeController(['group.0', 'cancel']), 'A', entries, 'Abbrechen', 'base')).toBeUndefined();
    expect(await selectNestedAction(fakeController(['group.0', undefined]), 'A', entries, 'Abbrechen', 'base')).toBeUndefined();
  });
});

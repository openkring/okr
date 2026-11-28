import { describe, expect, it } from 'vitest';

import type { SectionModel } from '@okr/shared-models';

import { usesPeopleEditor } from './people-editor-entry.util';

const section = (o: object = {}): SectionModel => ({ okey: 'p', type: 'people', properties: {}, ...o }) as unknown as SectionModel;

describe('usesPeopleEditor', () => {
  it.each<[string, SectionModel, boolean, boolean, boolean]>([
    ['people, editable, gate open', section(), false, true, true],
    ['people, gate closed', section(), false, false, false],
    ['people, read-only, gate open', section(), true, true, false],
    ['people, read-only, gate closed', section(), true, false, false],
    ['a new people section (no key), gate open', section({ okey: '' }), false, true, true],
    ['another type, gate open', section({ type: 'article' }), false, true, false],
    ['another type with people-like properties', section({ type: 'album', properties: { persons: [] } }), false, true, false],
  ])('%s', (_name, model, readOnly, gateOpen, expected) => {
    expect(usesPeopleEditor(model, readOnly, gateOpen)).toBe(expected);
  });
});

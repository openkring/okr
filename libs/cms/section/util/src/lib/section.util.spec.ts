import { describe, expect, it } from 'vitest';
import { ButtonAction, ButtonSection, ColorIonic, SECTION_TYPES, SectionType, WeatherSection } from '@okr/shared-models';

import { createSection, narrowSection } from './section.util';

const tenantId = 'tenant-1';

describe('createSection', () => {
  it('creates a section of the requested type with the tenant applied', () => {
    const section = createSection('cal', tenantId);
    expect(section.type).toBe('cal');
    expect(section.tenants).toEqual([tenantId]);
  });

  it('applies the default color, role and a computed index', () => {
    const section = createSection('iframe', tenantId);
    expect(section.color).toBe(ColorIonic.Primary);
    expect(section.roleNeeded).toBe('contentAdmin');
    expect(typeof section.index).toBe('string');
  });

  it('sets type-specific defaults for a button section', () => {
    const section = createSection('button', tenantId) as ButtonSection;
    expect(section.properties.action.type).toBe(ButtonAction.Download);
  });

  it('creates member-age, member-cat and rag sections (with defaults)', () => {
    expect(createSection('member-age', tenantId).type).toBe('member-age');
    expect(createSection('member-cat', tenantId).type).toBe('member-cat');
    const rag = createSection('rag', tenantId);
    expect(rag.type).toBe('rag');
    expect((rag.properties as { model: string }).model).toBeTruthy(); // default RagConfig
  });

  it('throws for an unknown section type', () => {
    expect(() => createSection('not-a-type' as never, tenantId)).toThrow();
  });
});

describe('narrowSection', () => {
  it('returns the section for a known type', () => {
    const section = createSection('cal', tenantId);
    expect(narrowSection(section)).toBe(section);
  });

  it('returns undefined for an unknown type', () => {
    expect(narrowSection({ type: 'totally-unknown' })).toBeUndefined();
  });

  it('returns undefined for the removed files/links types (§7 regression)', () => {
    expect(narrowSection({ type: 'files' })).toBeUndefined();
    expect(narrowSection({ type: 'links' })).toBeUndefined();
  });
});

describe('createSection — completeness over every SectionType', () => {
  // `weather` shipped with a dispatcher branch, a vest suite and a configuration form but NO
  // factory case, so "Section hinzufügen" died with `unknown section type 'weather'` — every
  // other wiring point looked done. This iterates the type list instead of naming types by
  // hand, which is the only version of this test that can catch the next one.
  //
  // WITHOUT_FACTORY are the types that predate weather and still have no case. They are
  // listed, not fixed: each needs its own shape and default, which is not this change's job.
  // Removing one from the list is how you retire it.
  const WITHOUT_FACTORY: SectionType[] = [
    'emergency', 'accordion', 'tasks', 'news', 'activities', 'messages', 'orgchart', 'trip-stats',
  ];

  const creatable = SECTION_TYPES.filter((t) => !WITHOUT_FACTORY.includes(t));

  it.each(creatable)('creates a %s section', (type) => {
    const section = createSection(type, tenantId);
    expect(section.type).toBe(type);
    expect(section.tenants).toEqual([tenantId]);
  });

  it('keeps the gap list honest — a listed type really does still throw', () => {
    // If one of these starts working, the entry is stale and belongs in `creatable`.
    for (const type of WITHOUT_FACTORY) {
      expect(() => createSection(type, tenantId), type).toThrow();
    }
  });

  it('never shares a mutable property object between two sections', () => {
    // The shapes are module-level constants: a bare spread hands every new section the SAME
    // nested objects. `locationKeys` is an array, so this bites hardest on weather.
    const a = createSection('weather', tenantId) as WeatherSection;
    const b = createSection('weather', tenantId) as WeatherSection;
    expect(a.properties).not.toBe(b.properties);
    a.properties.locationKeys?.push('loc1');
    expect(b.properties.locationKeys).toEqual([]);
  });
});

describe('narrowSection — completeness over every SectionType', () => {
  // A type missing here narrows to `undefined`, and section.store's save path skips silently
  // on undefined: the editor saves, nothing happens, nothing is logged. So an omission here
  // is worse than the createSection one, which at least threw.
  //
  // WITHOUT_NARROW documents the types that predate weather and still return undefined.
  const WITHOUT_NARROW: SectionType[] = [
    'emergency', 'accordion', 'tasks', 'news', 'activities', 'messages', 'orgchart', 'trip-stats',
  ];

  const narrowable = SECTION_TYPES.filter((t) => !WITHOUT_NARROW.includes(t));

  it.each(narrowable)('narrows a %s section instead of dropping it', (type) => {
    expect(narrowSection({ type, okey: 'k', name: 'n' })).toBeDefined();
  });

  it('keeps the gap list honest', () => {
    for (const type of WITHOUT_NARROW) {
      expect(narrowSection({ type, okey: 'k', name: 'n' }), type).toBeUndefined();
    }
  });
});

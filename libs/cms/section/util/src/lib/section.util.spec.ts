import { describe, expect, it } from 'vitest';
import { ButtonAction, ButtonSection, ColorIonic } from '@bk2/shared-models';

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

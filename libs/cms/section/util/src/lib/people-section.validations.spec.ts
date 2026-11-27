import { describe, expect, it } from 'vitest';
import { NameDisplay, PEOPLE_SECTION_SHAPE, PeopleSection } from '@okr/shared-models';

import { peopleSectionValidations } from './people-section.validations';

describe('peopleSectionValidations', () => {
  it('does not flag a valid title', () => {
    expect(peopleSectionValidations({ ...PEOPLE_SECTION_SHAPE }).hasErrors('title')).toBe(false);
  });

  it('flags a non-string title', () => {
    const model = { ...PEOPLE_SECTION_SHAPE, title: 123 } as unknown as PeopleSection;
    expect(peopleSectionValidations(model).hasErrors('title')).toBe(true);
  });
});

describe('peopleSectionValidations – look and overrides', () => {
  const withAvatar = (patch: Record<string, unknown>) => ({
    ...PEOPLE_SECTION_SHAPE,
    properties: { ...PEOPLE_SECTION_SHAPE.properties, avatar: { ...PEOPLE_SECTION_SHAPE.properties.avatar, ...patch } },
  }) as unknown as PeopleSection;
  const withProps = (patch: Record<string, unknown>) => ({
    ...PEOPLE_SECTION_SHAPE,
    properties: { ...PEOPLE_SECTION_SHAPE.properties, ...patch },
  }) as unknown as PeopleSection;

  it('accepts the defaults', () => {
    expect(peopleSectionValidations(withAvatar({})).hasErrors()).toBe(false);
  });

  it('accepts a legacy avatar config without the new fields', () => {
    const legacy = { ...PEOPLE_SECTION_SHAPE, properties: { ...PEOPLE_SECTION_SHAPE.properties, avatar: { title: '', altText: 'avatar', showName: true, showLabel: false, imgWidth: 4, imgRadius: 'round' } } } as unknown as PeopleSection;
    expect(peopleSectionValidations(legacy).hasErrors()).toBe(false);
  });

  it('accepts valid look values', () => {
    expect(peopleSectionValidations(withAvatar({ size: 'M', shape: 'rounded', fill: 'alternating', textPosition: 'overlay' })).hasErrors()).toBe(false);
  });

  it('flags unknown look values', () => {
    expect(peopleSectionValidations(withAvatar({ size: 'XL' })).hasErrors('avatar.size')).toBe(true);
    expect(peopleSectionValidations(withAvatar({ shape: 'oval' })).hasErrors('avatar.shape')).toBe(true);
    expect(peopleSectionValidations(withAvatar({ fill: 'colors' })).hasErrors('avatar.fill')).toBe(true);
    expect(peopleSectionValidations(withAvatar({ textPosition: 'above' })).hasErrors('avatar.textPosition')).toBe(true);
  });

  it('flags hiddenKeys and orderKeys that are not string arrays', () => {
    expect(peopleSectionValidations(withProps({ hiddenKeys: [42] })).hasErrors('hiddenKeys')).toBe(true);
    expect(peopleSectionValidations(withProps({ orderKeys: 'a' })).hasErrors('orderKeys')).toBe(true);
    expect(peopleSectionValidations(withProps({ hiddenKeys: ['a'], orderKeys: ['a'] })).hasErrors()).toBe(false);
  });

  it('keeps the info, width and nameDisplay rules', () => {
    expect(peopleSectionValidations(withAvatar({ info: ['phone'] })).hasErrors('avatar.info[0]')).toBe(true);
    expect(peopleSectionValidations(withAvatar({ width: 'wide' })).hasErrors('avatar.width')).toBe(true);
    expect(peopleSectionValidations(withAvatar({ nameDisplay: NameDisplay.None })).hasErrors('avatar.nameDisplay')).toBe(false);
  });
});

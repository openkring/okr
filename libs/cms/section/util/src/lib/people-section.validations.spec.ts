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

describe('peopleSectionValidations – view options', () => {
  const withAvatar = (patch: Record<string, unknown>) => ({
    ...PEOPLE_SECTION_SHAPE,
    properties: { ...PEOPLE_SECTION_SHAPE.properties, avatar: { ...PEOPLE_SECTION_SHAPE.properties.avatar, ...patch } },
  }) as unknown as PeopleSection;

  it('accepts the defaults', () => {
    expect(peopleSectionValidations(withAvatar({})).hasErrors()).toBe(false);
  });

  it('accepts a legacy avatar config without the new fields', () => {
    const legacy = { ...PEOPLE_SECTION_SHAPE, properties: { ...PEOPLE_SECTION_SHAPE.properties, avatar: { title: '', altText: 'avatar', showName: true, showLabel: false } } } as unknown as PeopleSection;
    expect(peopleSectionValidations(legacy).hasErrors()).toBe(false);
  });

  it('flags out-of-range numbers', () => {
    expect(peopleSectionValidations(withAvatar({ perRow: 2 })).hasErrors('avatar.perRow')).toBe(true);
    expect(peopleSectionValidations(withAvatar({ sliderRows: 5 })).hasErrors('avatar.sliderRows')).toBe(true);
    expect(peopleSectionValidations(withAvatar({ imgWidth: 4 })).hasErrors('avatar.imgWidth')).toBe(true);
    expect(peopleSectionValidations(withAvatar({ facePad: 3 })).hasErrors('avatar.facePad')).toBe(true);
  });

  it('flags an invalid radius but accepts px and 50%', () => {
    expect(peopleSectionValidations(withAvatar({ imgRadius: 'round' })).hasErrors('avatar.imgRadius')).toBe(true);
    expect(peopleSectionValidations(withAvatar({ imgRadius: '8px' })).hasErrors('avatar.imgRadius')).toBe(false);
    expect(peopleSectionValidations(withAvatar({ imgRadius: '50%' })).hasErrors('avatar.imgRadius')).toBe(false);
  });

  it('requires 1-4 valid colours for own colours', () => {
    expect(peopleSectionValidations(withAvatar({ background: 'colors', bgColors: [] })).hasErrors('avatar.bgColors')).toBe(true);
    expect(peopleSectionValidations(withAvatar({ background: 'colors', bgColors: ['#ff0000'] })).hasErrors('avatar.bgColors')).toBe(false);
    expect(peopleSectionValidations(withAvatar({ bgColors: ['red'] })).hasErrors('avatar.bgColors')).toBe(true);
    expect(peopleSectionValidations(withAvatar({ bgColors: ['#000000', '#000000', '#000000', '#000000', '#000000'] })).hasErrors('avatar.bgColors')).toBe(true);
  });

  it('flags unknown options', () => {
    expect(peopleSectionValidations(withAvatar({ view: 'carousel' })).hasErrors('avatar.view')).toBe(true);
    expect(peopleSectionValidations(withAvatar({ infoPosition: 'middle' })).hasErrors('avatar.infoPosition')).toBe(true);
    expect(peopleSectionValidations(withAvatar({ info: ['phone'] })).hasErrors('avatar.info[0]')).toBe(true);
    expect(peopleSectionValidations(withAvatar({ nameDisplay: NameDisplay.None })).hasErrors('avatar.nameDisplay')).toBe(false);
  });
});

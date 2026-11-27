import { describe, expect, it } from 'vitest';
import { ColorIonic, NameDisplay, type AvatarConfig, type AvatarInfo, type PeopleConfig, type PeopleSection } from '@okr/shared-models';

import { hidePeoplePerson, movePeoplePerson, setPeopleLook, showPeoplePerson } from './people-edit.util';
import { isPeopleSectionChanged, openPeopleSection, peopleTypingTag, preparePeopleForSave } from './people-editor.util';

const person = (key: string, label = ''): AvatarInfo => ({ key, name1: key, name2: '', modelType: 'person', type: '', subType: '', label }) as unknown as AvatarInfo;

/** a section as Firestore returns it: no model defaults, only what was stored */
function stored(properties: Partial<PeopleConfig>, base: Partial<PeopleSection> = {}): PeopleSection {
  return { okey: 'sec', type: 'people', title: 'Vorstand', tenants: ['scs'], properties, ...base } as unknown as PeopleSection;
}

const legacyAvatar = (patch: Partial<AvatarConfig>): AvatarConfig => ({
  nameDisplay: NameDisplay.FirstLast, altText: 'Avatar von @NAME@', title: '', linkedSection: '', color: ColorIonic.Light, view: 'card', perRow: 5, sliderRows: 1,
  imgHeight: patch.imgWidth ?? 120, facePad: 0, bgColors: [], info: ['function'], ...patch,
}) as unknown as AvatarConfig;

/** the 7 styled sections of design §6.3, with the stale fields they carry, and the look they snap to */
const STYLED: { name: string; config: Partial<PeopleConfig>; look: Partial<AvatarConfig> }[] = [
  { name: 'J+S Leiter', config: { type: 'responsibility', persons: [], responsibilityIds: ['r1'], avatar: legacyAvatar({ imgWidth: 200, imgRadius: '5px', background: 'orgColor', bgOrgColor: 'alternating', grayscale: true, infoPosition: 'below' }) },
    look: { size: 'M', shape: 'rounded', fill: 'alternating', textPosition: 'below' } },
  { name: 'Weitere Aufgaben', config: { type: 'responsibility', persons: [], responsibilityIds: ['r2'], avatar: legacyAvatar({ imgWidth: 200, imgRadius: '4px', background: 'orgColor', bgOrgColor: 'alternating', grayscale: true, infoPosition: 'below' }) },
    look: { size: 'M', shape: 'rounded', fill: 'alternating', textPosition: 'below' } },
  { name: 'Vorstand', config: { type: 'responsibility', persons: [person('p1')], groupId: 'g', responsibilityIds: ['r3'], avatar: legacyAvatar({ imgWidth: 200, imgRadius: '5px', background: 'orgColor', bgOrgColor: 'alternating', grayscale: true, infoPosition: 'below' }) },
    look: { size: 'M', shape: 'rounded', fill: 'alternating', textPosition: 'below' } },
  { name: 'Coaches', config: { type: 'group', persons: [], groupId: 'coaches', excludedPersons: [person('x')], avatar: legacyAvatar({ imgWidth: 200, imgRadius: '4px', background: 'orgColor', bgOrgColor: 'alternating', grayscale: true, infoPosition: 'below' }) },
    look: { size: 'M', shape: 'rounded', fill: 'alternating', textPosition: 'below' } },
  { name: 'Unsere Coaches', config: { type: 'group', persons: [], groupId: 'c2', avatar: legacyAvatar({ imgWidth: 120, imgRadius: '5px', background: 'orgColor', bgOrgColor: 'alternating', grayscale: true, infoPosition: 'below' }) },
    look: { size: 'S', shape: 'rounded', fill: 'alternating', textPosition: 'below' } },
  { name: 'Verantwortliche', config: { type: 'persons', persons: [person('a'), person('b')], groupId: 'g', responsibilityId: 'r', avatar: legacyAvatar({ imgWidth: 300, imgRadius: '5px', background: 'orgColor', bgOrgColor: 'primary', grayscale: false, infoPosition: 'overlayBottom' }) },
    look: { size: 'L', shape: 'rounded', fill: 'primary', textPosition: 'overlay' } },
  { name: 'Bootshauskommission', config: { type: 'persons', persons: [person('c')], groupId: 'g', avatar: legacyAvatar({ imgWidth: 120, imgRadius: '50%', background: 'original', grayscale: false, infoPosition: 'right' }) },
    look: { size: 'S', shape: 'round', fill: 'original', textPosition: 'right' } },
];

/** a section never saved with the current form: the avatar holds only the retired flags */
const LEGACY = stored({ type: 'group', persons: [], groupId: 'g', excludedPersons: [person('x')], avatar: { showName: true, showLabel: true } as unknown as AvatarConfig });

/** every key a config refers to, so that nothing is dropped as stale */
const keysOf = (c: PeopleConfig): string[] => [
  ...c.persons.map((p) => p.key), ...(c.hiddenKeys ?? []), ...(c.orderKeys ?? []), ...(c.excludedPersons ?? []).map((p) => p.key),
];

describe('openPeopleSection', () => {
  it('fills what the editor needs and changes no stored value', () => {
    const section = stored({ type: 'group', groupId: 'g' } as Partial<PeopleConfig>);
    const opened = openPeopleSection(section);
    expect(opened.name).toBe('');
    expect(opened.subTitle).toBe('');
    expect(opened.notes).toBe('');
    expect(opened.tags).toBe('');
    expect(opened.title).toBe('Vorstand');
    expect(opened.properties.type).toBe('group');
    expect(opened.properties.groupId).toBe('g');
    expect(opened.properties.persons).toEqual([]);
    expect(opened.properties.avatar).toBeDefined();
    expect(section.properties.persons).toBeUndefined();
  });

  it('a section without properties gets hand-picked persons', () => {
    const opened = openPeopleSection({ okey: 'n', type: 'people' } as unknown as PeopleSection);
    expect(opened.properties.type).toBe('persons');
    expect(opened.properties.persons).toEqual([]);
  });

  it('keeps an avatar as stored', () => {
    const avatar = legacyAvatar({ imgWidth: 300 });
    expect(openPeopleSection(stored({ type: 'persons', persons: [], avatar })).properties.avatar).toBe(avatar);
  });
});

describe('isPeopleSectionChanged', () => {
  for (const { name, config } of [...STYLED, { name: 'legacy', config: LEGACY.properties }]) {
    it(`${name}: opened is unchanged, and so is its cleaned form`, () => {
      const opened = openPeopleSection(stored(config));
      expect(isPeopleSectionChanged(opened, opened)).toBe(false);
      expect(isPeopleSectionChanged(opened, openPeopleSection(structuredClone(stored(config))))).toBe(false);
      expect(isPeopleSectionChanged(opened, preparePeopleForSave(opened, keysOf(opened.properties)))).toBe(false);
    });
  }

  it('a hide and a show again is no change', () => {
    const opened = openPeopleSection(stored({ type: 'group', persons: [], groupId: 'g', avatar: legacyAvatar({}) }));
    const hidden = { ...opened, properties: hidePeoplePerson(opened.properties, 'a') };
    expect(isPeopleSectionChanged(opened, hidden)).toBe(true);
    const shown = { ...hidden, properties: showPeoplePerson(hidden.properties, 'a') };
    expect(isPeopleSectionChanged(opened, shown)).toBe(false);
  });

  it('a hide and show again of a legacy excluded member is no change', () => {
    const opened = openPeopleSection(LEGACY);
    const shown = { ...opened, properties: showPeoplePerson(opened.properties, 'x') };
    expect(isPeopleSectionChanged(opened, shown)).toBe(true);
    expect(isPeopleSectionChanged(opened, { ...shown, properties: hidePeoplePerson(shown.properties, 'x') })).toBe(false);
  });

  it('a move there and back of a hand-picked person is no change', () => {
    const opened = openPeopleSection(stored({ type: 'persons', persons: [person('a'), person('b')], avatar: legacyAvatar({}) }));
    const keys = ['a', 'b'];
    const moved = { ...opened, properties: movePeoplePerson(opened.properties, keys, 'a', 1) };
    expect(isPeopleSectionChanged(opened, moved)).toBe(true);
    expect(isPeopleSectionChanged(opened, { ...moved, properties: movePeoplePerson(moved.properties, ['b', 'a'], 'a', -1) })).toBe(false);
  });

  it('a move there and back of a group member is no change', () => {
    const opened = openPeopleSection(stored({ type: 'group', persons: [], groupId: 'g', avatar: legacyAvatar({}) }));
    const natural = ['a', 'b', 'c'];
    const moved = { ...opened, properties: movePeoplePerson(opened.properties, natural, 'b', 1, natural) };
    expect(moved.properties.orderKeys).toEqual(['a', 'c', 'b']);
    expect(isPeopleSectionChanged(opened, moved)).toBe(true);
    const back = { ...moved, properties: movePeoplePerson(moved.properties, ['a', 'c', 'b'], 'b', -1, natural) };
    expect(back.properties).not.toHaveProperty('orderKeys');
    expect(isPeopleSectionChanged(opened, back)).toBe(false);
  });

  it('a look written in full is no change when it draws the same', () => {
    const opened = openPeopleSection(stored(STYLED[0].config));
    const same = { ...opened, properties: setPeopleLook(opened.properties, { size: 'M' }) };
    expect(isPeopleSectionChanged(opened, same)).toBe(false);
    expect(isPeopleSectionChanged(opened, { ...opened, properties: setPeopleLook(opened.properties, { size: 'L' }) })).toBe(true);
  });

  it('an empty and a missing field are one value; a typed one is a change', () => {
    const opened = openPeopleSection(stored({ type: 'persons', persons: [] }));
    expect(isPeopleSectionChanged(opened, { ...opened, intro: '' })).toBe(false);
    expect(isPeopleSectionChanged(opened, { ...opened, title: 'Coaches' })).toBe(true);
    expect(isPeopleSectionChanged(opened, { ...opened, tags: 'a' })).toBe(true);
  });

  it('index, okey and tenants do not count', () => {
    const opened = openPeopleSection(stored({ type: 'persons', persons: [] }));
    expect(isPeopleSectionChanged(opened, { ...opened, index: 'x', okey: 'other', tenants: ['b'] })).toBe(false);
  });
});

describe('preparePeopleForSave', () => {
  it('snaps the styled sections to their look and drops the old fields', () => {
    for (const { name, config, look } of STYLED) {
      const avatar = preparePeopleForSave(openPeopleSection(stored(config)), keysOf(config as PeopleConfig)).properties.avatar;
      expect({ name, size: avatar.size, shape: avatar.shape, fill: avatar.fill, textPosition: avatar.textPosition })
        .toEqual({ name, ...look });
      for (const old of ['imgWidth', 'imgHeight', 'imgRadius', 'background', 'bgOrgColor', 'bgColors', 'color', 'perRow', 'sliderRows', 'facePad', 'infoPosition']) {
        expect(avatar).not.toHaveProperty(old);
      }
    }
  });

  it('drops stale override keys', () => {
    const section = openPeopleSection(stored({ type: 'group', persons: [], groupId: 'g', hiddenKeys: ['a', 'gone'], orderKeys: ['b', 'left', 'a'] }));
    const saved = preparePeopleForSave(section, ['a', 'b']).properties;
    expect(saved.hiddenKeys).toEqual(['a']);
    expect(saved.orderKeys).toEqual(['b', 'a']);
  });

  it('drops an orderKeys equal to the natural order', () => {
    const section = openPeopleSection(stored({ type: 'group', persons: [], groupId: 'g', orderKeys: ['a', 'b'] }));
    expect(preparePeopleForSave(section, ['a', 'b', 'c'], ['a', 'b', 'c']).properties).not.toHaveProperty('orderKeys');
    expect(preparePeopleForSave(section, ['a', 'b', 'c'], ['b', 'a', 'c']).properties.orderKeys).toEqual(['a', 'b']);
    expect(preparePeopleForSave(section, ['a', 'b', 'c']).properties.orderKeys).toEqual(['a', 'b']);
  });

  it('drops the fields of other sources', () => {
    const vorstand = preparePeopleForSave(openPeopleSection(stored(STYLED[2].config)), []).properties;
    expect(vorstand.groupId).toBeUndefined();
    expect(vorstand.persons).toEqual([]);
    expect(vorstand.responsibilityIds).toEqual(['r3']);
    const verantwortliche = preparePeopleForSave(openPeopleSection(stored(STYLED[5].config)), ['a', 'b']).properties;
    expect(verantwortliche.groupId).toBeUndefined();
    expect(verantwortliche.responsibilityId).toBeUndefined();
    expect(verantwortliche.persons.map((p) => p.key)).toEqual(['a', 'b']);
  });

  it('keeps the meaning of the retired flags and moves excludedPersons to hiddenKeys', () => {
    const saved = preparePeopleForSave(openPeopleSection(stored({ type: 'group', persons: [], groupId: 'g', excludedPersons: [person('x')], avatar: { showName: false, showLabel: false } as unknown as AvatarConfig })), ['x']).properties;
    expect(saved.avatar.nameDisplay).toBe(NameDisplay.None);
    expect(saved.avatar.info).toEqual([]);
    expect(saved.avatar).not.toHaveProperty('showName');
    expect(saved.excludedPersons).toBeUndefined();
    expect(saved.hiddenKeys).toEqual(['x']);
  });

  it('never mutates', () => {
    const section = openPeopleSection(stored(STYLED[3].config));
    const copy = structuredClone(section);
    preparePeopleForSave(section, []);
    expect(section).toEqual(copy);
  });
});

describe('peopleTypingTag', () => {
  const opened = openPeopleSection(stored({ type: 'persons', persons: [person('a', 'Präsident')], avatar: legacyAvatar({}) }));

  it('tags a field of the section', () => {
    expect(peopleTypingTag(opened, { ...opened, title: 'Neu' })).toBe('section:title');
    expect(peopleTypingTag(opened, { ...opened, intro: 'x' })).toBe('section:intro');
  });

  it('tags a text of the avatar', () => {
    const avatar = { ...opened.properties.avatar, altText: 'Bild von @NAME@' };
    expect(peopleTypingTag(opened, { ...opened, properties: { ...opened.properties, avatar } })).toBe('avatar:altText');
  });

  it('tags the function of a hand-picked person', () => {
    const persons = [{ ...opened.properties.persons[0], label: 'Präsidentin' }];
    expect(peopleTypingTag(opened, { ...opened, properties: { ...opened.properties, persons } })).toBe('label:a');
  });

  it('no tag for anything else', () => {
    expect(peopleTypingTag(opened, { ...opened, title: 'x', subTitle: 'y' })).toBeUndefined();
    expect(peopleTypingTag(opened, { ...opened, properties: setPeopleLook(opened.properties, { size: 'L' }) })).toBeUndefined();
    expect(peopleTypingTag(opened, { ...opened, properties: hidePeoplePerson(opened.properties, 'a') })).toBeUndefined();
    expect(peopleTypingTag(opened, opened)).toBeUndefined();
  });
});

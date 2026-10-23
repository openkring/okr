import { learningItemValidations, learningRoomValidations } from './learning.validations';

import type { LearningItemFormData, LearningRoomFormData } from './learning.validations';

const item = (o: Partial<LearningItemFormData> = {}): LearningItemFormData =>
  ({ title: 'T', tags: '', notes: '', links: [], attachmentKeys: [], ...o });
const room = (o: Partial<LearningRoomFormData> = {}): LearningRoomFormData => ({
  name: 'Segeln', mode: 'menu', groupKey: '', folder: 'f1', createFolder: false, topics: 'a, b',
  curators: [{ tag: 'a', personKeys: ['p1'] }], defaultTab: 'files', ...o,
});

describe('learningItemValidations', () => {
  it('accepts a valid item', () => expect(learningItemValidations(item()).isValid()).toBe(true));
  it('requires a title up to 200 chars', () => {
    expect(learningItemValidations(item({ title: '' })).hasErrors('title')).toBe(true);
    expect(learningItemValidations(item({ title: 'x'.repeat(201) })).hasErrors('title')).toBe(true);
  });
  it('limits notes to 20000 chars', () => {
    expect(learningItemValidations(item({ notes: 'x'.repeat(20001) })).hasErrors('notes')).toBe(true);
  });
  it('checks links: title, https url, max 20', () => {
    expect(learningItemValidations(item({ links: [{ title: '', url: 'https://a.ch' }] })).hasErrors('links[0].title')).toBe(true);
    expect(learningItemValidations(item({ links: [{ title: 'a', url: 'http://a.ch' }] })).hasErrors('links[0].url')).toBe(true);
    expect(learningItemValidations(item({ links: [{ title: 'a', url: 'https://a.ch' }] })).isValid()).toBe(true);
    const many = Array.from({ length: 21 }, () => ({ title: 'a', url: 'https://a.ch' }));
    expect(learningItemValidations(item({ links: many })).hasErrors('links')).toBe(true);
  });
});

describe('learningRoomValidations', () => {
  it('accepts a valid room', () => expect(learningRoomValidations(room()).isValid()).toBe(true));
  it('requires name 1..80 and folder', () => {
    expect(learningRoomValidations(room({ name: '' })).hasErrors('name')).toBe(true);
    expect(learningRoomValidations(room({ name: 'x'.repeat(81) })).hasErrors('name')).toBe(true);
    expect(learningRoomValidations(room({ folder: '' })).hasErrors('folder')).toBe(true);
  });
  it('skips the folder when a new one is created', () => {
    expect(learningRoomValidations(room({ folder: '', createFolder: true })).isValid()).toBe(true);
  });
  it('a group room needs the group, not a folder', () => {
    expect(learningRoomValidations(room({ mode: 'group', folder: '', groupKey: '' })).hasErrors('groupKey')).toBe(true);
    expect(learningRoomValidations(room({ mode: 'group', folder: '', groupKey: 'g1' })).isValid()).toBe(true);
    expect(learningRoomValidations(room({ mode: 'menu', groupKey: '' })).hasErrors('groupKey')).toBe(false);
  });
  it('limits topics to 30', () => {
    const topics = Array.from({ length: 31 }, (_, i) => 't' + i).join(',');
    expect(learningRoomValidations(room({ topics })).hasErrors('topics')).toBe(true);
  });
  it('curators must be persons', () => {
    expect(learningRoomValidations(room({ curators: [{ tag: 'a', personKeys: ['org.x'] }] })).hasErrors('curators')).toBe(true);
    expect(learningRoomValidations(room({ curators: [{ tag: 'a', personKeys: ['p1'] }] })).isValid()).toBe(true);
    expect(learningRoomValidations(room({ curators: [{ tag: 'a', personKeys: ['person.p1'] }] })).hasErrors('curators')).toBe(true);
  });
});

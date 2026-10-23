import { enforce, only, staticSuite, test } from 'vest';

import { LEARNING_I18N_KEYS as K } from './learning-i18n';


export const LEARNING_TITLE_MAX = 200;
export const LEARNING_LINK_TITLE_MAX = 100;
export const LEARNING_NOTES_MAX = 20000;
export const LEARNING_LINKS_MAX = 20;
export const LEARNING_ROOM_NAME_MAX = 80;
export const LEARNING_TOPICS_MAX = 30;

export interface LearningItemFormData {
  title: string;
  notes: string;
  links: { title: string; url: string }[];
}

export interface LearningRoomFormData {
  name: string;
  folder: string;
  /** comma-separated tags */
  topics: string;
  curators: { tag: string; personKeys: string[] }[];
}

const isHttps = (u: string) => /^https:\/\/[^\s/$.?#][^\s]*$/i.test(u ?? '');
// persons only: bare person okeys; any prefixed key (org.x, person.x, group.x) is rejected
const isPersonKey = (k: string) => typeof k === 'string' && !!k && !k.includes('.');

export const learningItemValidations = staticSuite((model: LearningItemFormData, field?: string) => {
  only(field);
  const title = (model.title ?? '').trim();
  test('title', K.validation_titleRequired, () => { enforce(title.length).greaterThan(0); });
  test('title', K.validation_titleTooLong, () => { enforce(title.length).lessThanOrEquals(LEARNING_TITLE_MAX); });
  test('notes', K.validation_notesTooLong, () => {
    enforce((model.notes ?? '').length).lessThanOrEquals(LEARNING_NOTES_MAX);
  });
  const links = model.links ?? [];
  test('links', K.validation_tooManyLinks, () => { enforce(links.length).lessThanOrEquals(LEARNING_LINKS_MAX); });
  links.forEach((l, i) => {
    test(`links[${i}].title`, K.validation_linkTitle, () => {
      const n = (l.title ?? '').trim().length;
      enforce(n).greaterThan(0);
      enforce(n).lessThanOrEquals(LEARNING_LINK_TITLE_MAX);
    });
    test(`links[${i}].url`, K.validation_linkUrl, () => { enforce(isHttps(l.url)).isTruthy(); });
  });
});

export const learningRoomValidations = staticSuite((model: LearningRoomFormData, field?: string) => {
  only(field);
  const name = (model.name ?? '').trim();
  test('name', K.validation_nameRequired, () => { enforce(name.length).greaterThan(0); });
  test('name', K.validation_nameTooLong, () => { enforce(name.length).lessThanOrEquals(LEARNING_ROOM_NAME_MAX); });
  test('folder', K.validation_folderRequired, () => { enforce((model.folder ?? '').trim().length).greaterThan(0); });
  test('topics', K.validation_tooManyTopics, () => {
    const n = (model.topics ?? '').split(',').map(t => t.trim()).filter(Boolean).length;
    enforce(n).lessThanOrEquals(LEARNING_TOPICS_MAX);
  });
  test('curators', K.validation_curatorsPersonsOnly, () => {
    enforce((model.curators ?? []).every(c => (c.personKeys ?? []).every(isPersonKey))).isTruthy();
  });
});

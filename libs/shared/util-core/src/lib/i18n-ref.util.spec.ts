import { describe, expect, it } from 'vitest';
import { CategoryListModel } from '@okr/shared-models';

import { getItemLabel } from './category.util';
import { completeLabels, toI18nRef } from './i18n-ref.util';

describe('toI18nRef', () => {
  it('splits a tag', () => {
    expect(toI18nRef('@tag.ezs')).toEqual({ module: 'tag', key: 'ezs' });
  });

  it('splits the label key of a list item: module = scope without @, key = <list>.<item>.label', () => {
    const list = new CategoryListModel('scs');
    Object.assign(list, { name: 'address_channel', i18n: '@subject/address/feature', translateItems: true });
    expect(toI18nRef(getItemLabel(list, 'pager'))).toEqual({ module: 'subject/address/feature', key: 'address_channel.pager.label' });
  });

  it('yields undefined for what has no translation', () => {
    expect(toI18nRef('raw')).toBeUndefined();
    expect(toI18nRef('@save')).toBeUndefined();
    expect(toI18nRef('@tag.')).toBeUndefined();
    expect(toI18nRef('@.x')).toBeUndefined();
    expect(toI18nRef('')).toBeUndefined();
  });
});

describe('completeLabels', () => {
  it('fills empty languages with the first label entered', () => {
    expect(completeLabels({ de: '', en: ' Pager ', fr: '' }, 'pager')).toEqual({ de: 'Pager', en: 'Pager', fr: 'Pager', es: 'Pager', it: 'Pager' });
  });
  it('keeps what is entered', () => {
    expect(completeLabels({ de: 'Funk', en: 'Pager', fr: 'Bip', es: 'Busca', it: 'Cerca' }, 'x'))
      .toEqual({ de: 'Funk', en: 'Pager', fr: 'Bip', es: 'Busca', it: 'Cerca' });
  });
  it('shows the name when nothing is entered', () => {
    expect(completeLabels({}, 'pager')).toEqual({ de: 'pager', en: 'pager', fr: 'pager', es: 'pager', it: 'pager' });
  });
});

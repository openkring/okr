import { describe, expect, it } from 'vitest';

import { MAIL_BLOCK_TYPES } from '@okr/shared-models';

import { ARTICLE_EDITOR_I18N_KEYS, blockTypeLabel, type ArticleEditorI18n } from './article-editor-i18n';

describe('blockTypeLabel', () => {
  const i18n = Object.fromEntries(Object.entries(ARTICLE_EDITOR_I18N_KEYS).map(([key, value]) => [key, () => value])) as unknown as ArticleEditorI18n;

  it('names every block type, those of a mail too', () => {
    for (const type of MAIL_BLOCK_TYPES) expect(blockTypeLabel(i18n, type)).toBe(`@cms/section/feature.article.editor.block.${type}`);
  });

  it.each(['video', '', 'constructor', undefined as unknown as string])('«Unbekannter Block» for %s', (type) => {
    expect(blockTypeLabel(i18n, type)).toBe('@cms/section/feature.article.editor.block.unknown');
  });
});

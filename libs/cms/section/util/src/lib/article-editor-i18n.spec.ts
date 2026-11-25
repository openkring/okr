import { describe, expect, it } from 'vitest';

import { MAIL_BLOCK_TYPES } from '@okr/shared-models';

import { ARTICLE_EDITOR_I18N_KEYS, blockTypeLabel, editorTexts, type ArticleEditorI18n } from './article-editor-i18n';
import { ARTICLE_PROFILE, MAIL_PROFILE } from './editor-profile';
import { SECTION_I18N_KEYS } from './section-i18n';

describe('blockTypeLabel', () => {
  const i18n = Object.fromEntries(Object.entries(ARTICLE_EDITOR_I18N_KEYS).map(([key, value]) => [key, () => value])) as unknown as ArticleEditorI18n;

  it('names every block type, those of a mail too', () => {
    for (const type of MAIL_BLOCK_TYPES) expect(blockTypeLabel(i18n, type)).toBe(`@cms/section/feature.article.editor.block.${type}`);
  });

  it.each(['video', '', 'constructor', undefined as unknown as string])('«Unbekannter Block» for %s', (type) => {
    expect(blockTypeLabel(i18n, type)).toBe('@cms/section/feature.article.editor.block.unknown');
  });
});

describe('editorTexts', () => {
  const i18n = Object.fromEntries(Object.entries({ ...SECTION_I18N_KEYS, ...ARTICLE_EDITOR_I18N_KEYS }).map(([key, value]) => [key, () => value])) as unknown as ArticleEditorI18n;

  it('an article gets the very texts', () => {
    expect(editorTexts(i18n, ARTICLE_PROFILE)).toBe(i18n);
  });

  it('a mail says mail where the others say article, under the same names', () => {
    const mail = editorTexts(i18n, MAIL_PROFILE);
    expect(mail.article_editor_canvas_label()).toBe('@cms/section/feature.article.editor.mail.canvasLabel');
    expect(mail.article_editor_library_full()).toBe('@cms/section/feature.article.editor.mail.full');
    expect(mail.cta_url_helper()).toBe('@cms/section/feature.article.editor.mail.target.helper');
    expect(mail.article_editor_undo).toBe(i18n.article_editor_undo);
    expect(Object.keys(mail)).toEqual(Object.keys(i18n));
  });

  it('every text of a mail exists, and none is used twice for the same name', () => {
    const mail = editorTexts(i18n, MAIL_PROFILE) as unknown as Record<string, () => string>;
    for (const [key, text] of Object.entries(mail)) expect(typeof text, key).toBe('function');
  });
});

import { describe, expect, it } from 'vitest';

import { FOOTER_ITEM_SHAPE, FOOTER_SECTION_SHAPE, FooterConfig, FooterItem, FooterSection } from '@okr/shared-models';

import { FOOTER_BOTTOM_LINE_LENGTH, FOOTER_LABEL_LENGTH, FOOTER_TEXT_LENGTH, footerSectionValidations } from './footer-section.validations';
import { footerItemField } from './footer.util';

const section = (config: Partial<FooterConfig>): FooterSection => ({
  ...FOOTER_SECTION_SHAPE,
  okey: 'k', name: 'n', title: 't', tenants: ['t1'],
  properties: { ...FOOTER_SECTION_SHAPE.properties, ...config },
} as FooterSection);

/** a footer whose first column holds just this item */
const withItem = (item: Partial<FooterItem>): FooterSection =>
  section({ columns: [{ items: [{ ...FOOTER_ITEM_SHAPE, ...item }] }, { items: [] }, { items: [] }] });

const itemHasErrors = (item: Partial<FooterItem>, field: keyof FooterItem): boolean =>
  footerSectionValidations(withItem(item)).hasErrors(footerItemField(0, 0, field));

describe('footerSectionValidations', () => {
  it('accepts the default shape', () => {
    expect(footerSectionValidations(section({})).hasErrors()).toBe(false);
  });

  it('keeps the column count within 1…3', () => {
    expect(footerSectionValidations(section({ columnCount: 1 })).hasErrors('footer.columnCount')).toBe(false);
    expect(footerSectionValidations(section({ columnCount: 3 })).hasErrors('footer.columnCount')).toBe(false);
    expect(footerSectionValidations(section({ columnCount: 0 })).hasErrors('footer.columnCount')).toBe(true);
    expect(footerSectionValidations(section({ columnCount: 4 })).hasErrors('footer.columnCount')).toBe(true);
    expect(footerSectionValidations(section({ columnCount: 1.5 })).hasErrors('footer.columnCount')).toBe(true);
  });

  it('caps the bottom line', () => {
    expect(footerSectionValidations(section({ bottomLine: 'x'.repeat(FOOTER_BOTTOM_LINE_LENGTH) })).hasErrors('footer.bottomLine')).toBe(false);
    expect(footerSectionValidations(section({ bottomLine: 'x'.repeat(FOOTER_BOTTOM_LINE_LENGTH + 1) })).hasErrors('footer.bottomLine')).toBe(true);
  });

  it('rejects an unknown item type', () => {
    expect(itemHasErrors({ type: 'title', label: 'Rechtliches' }, 'type')).toBe(false);
    expect(itemHasErrors({ type: 'banner' as FooterItem['type'], label: 'x' }, 'type')).toBe(true);
  });

  it('requires words on a title, text and link, but not on an icon or logo', () => {
    expect(itemHasErrors({ type: 'title', label: '' }, 'label')).toBe(true);
    expect(itemHasErrors({ type: 'text', label: '' }, 'label')).toBe(true);
    expect(itemHasErrors({ type: 'link', label: '', url: 'https://x.ch' }, 'label')).toBe(true);
    expect(itemHasErrors({ type: 'icon', label: '', icon: 'email' }, 'label')).toBe(false);
    expect(itemHasErrors({ type: 'logo', label: '', image: 'tenant/scs/logo.png' }, 'label')).toBe(false);
  });

  it('gives a text item more room than a title', () => {
    expect(itemHasErrors({ type: 'text', label: 'x'.repeat(FOOTER_TEXT_LENGTH) }, 'label')).toBe(false);
    expect(itemHasErrors({ type: 'title', label: 'x'.repeat(FOOTER_LABEL_LENGTH + 1) }, 'label')).toBe(true);
  });

  it('requires a target on a link and only accepts safe ones', () => {
    expect(itemHasErrors({ type: 'link', label: 'Impressum', url: '' }, 'url')).toBe(true);
    expect(itemHasErrors({ type: 'link', label: 'Impressum', url: 'https://seeclub.org/impressum' }, 'url')).toBe(false);
    expect(itemHasErrors({ type: 'link', label: 'Mail', url: 'mailto:info@seeclub.org' }, 'url')).toBe(false);
    expect(itemHasErrors({ type: 'link', label: 'Seite', url: '/private/page' }, 'url')).toBe(false);
    expect(itemHasErrors({ type: 'link', label: 'x', url: 'javascript:alert(1)' }, 'url')).toBe(true);
    expect(itemHasErrors({ type: 'link', label: 'x', url: 'http://plain.ch' }, 'url')).toBe(true);
    expect(itemHasErrors({ type: 'logo', image: 'a.png', url: '' }, 'url')).toBe(false);
  });

  it('requires the icon name of an icon and the image of a logo', () => {
    expect(itemHasErrors({ type: 'icon', icon: '' }, 'icon')).toBe(true);
    expect(itemHasErrors({ type: 'icon', icon: 'email' }, 'icon')).toBe(false);
    expect(itemHasErrors({ type: 'logo', image: '' }, 'image')).toBe(true);
    expect(itemHasErrors({ type: 'logo', image: 'tenant/scs/sponsor.png' }, 'image')).toBe(false);
  });

  it('rejects an unknown logo height', () => {
    expect(itemHasErrors({ type: 'logo', image: 'a.png', height: 'large' }, 'height')).toBe(false);
    expect(itemHasErrors({ type: 'logo', image: 'a.png', height: 'huge' as FooterItem['height'] }, 'height')).toBe(true);
  });
});

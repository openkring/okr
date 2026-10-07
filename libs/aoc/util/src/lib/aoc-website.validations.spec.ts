import { describe, expect, it } from 'vitest';
import { WebsiteContentModel } from '@okr/shared-models';
import { aocWebsiteValidations } from './aoc-website.validations';

function newItem(patch: Partial<WebsiteContentModel> = {}): WebsiteContentModel {
  return { ...new WebsiteContentModel('scs'), key: 'home.title', ...patch };
}

describe('aocWebsiteValidations', () => {
  it('accepts a text with empty languages', () => {
    expect(aocWebsiteValidations(newItem({ de: '', en: '' })).isValid()).toBe(true);
  });

  it('accepts plain text and html texts', () => {
    expect(aocWebsiteValidations(newItem({ de: 'Hallo', en: 'Hello' })).isValid()).toBe(true);
    expect(aocWebsiteValidations(newItem({ isHtml: true, de: '<p>Hallo</p>', en: '<p>Hello</p>' })).isValid()).toBe(true);
  });

  it('accepts a long html text (no length cap)', () => {
    expect(aocWebsiteValidations(newItem({ isHtml: true, de: '<p>' + 'x'.repeat(20000) + '</p>' })).isValid()).toBe(true);
  });

  it('rejects a missing language text', () => {
    const item = newItem();
    (item as unknown as Record<string, unknown>)['en'] = undefined;
    expect(aocWebsiteValidations(item).hasErrors('en')).toBe(true);
  });
});

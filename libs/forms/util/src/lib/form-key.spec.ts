import { describe, it, expect } from 'vitest';
import { generateFormKey } from './form-key';

describe('generateFormKey', () => {
  it('produces a lowercase hyphenated slug with 4-char suffix', () => {
    const key = generateFormKey('Contact Form');
    expect(key).toMatch(/^contact-form-[a-z0-9]{4}$/);
  });

  it('strips special characters', () => {
    const key = generateFormKey('Hello! World@#$');
    expect(key).toMatch(/^hello-world-[a-z0-9]{4}$/);
  });

  it('generates unique keys for the same name', () => {
    const a = generateFormKey('Test');
    const b = generateFormKey('Test');
    expect(a).not.toEqual(b);
  });

  it('truncates long names to ~44 chars', () => {
    const key = generateFormKey('A very long form name that exceeds the maximum allowed length limit');
    expect(key.length).toBeLessThanOrEqual(45);
  });
});

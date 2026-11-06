import { describe, expect, it } from 'vitest';

import { mayPreviewTemplate, parseSampleData } from './render-email-preview';

describe('parseSampleData', () => {
  it('returns {} for invalid JSON', () => {
    expect(parseSampleData('{oops')).toEqual({});
    expect(parseSampleData(undefined)).toEqual({});
    expect(parseSampleData('')).toEqual({});
  });

  it('returns {} for JSON that is not an object', () => {
    expect(parseSampleData('[1,2]')).toEqual({});
    expect(parseSampleData('null')).toEqual({});
    expect(parseSampleData('"x"')).toEqual({});
  });

  it('keeps strings, numbers and booleans as strings and drops nested values', () => {
    expect(parseSampleData('{"url":"https://a.ch","n":3,"b":true,"o":{"x":1},"a":[1],"z":null}')).toEqual({ url: 'https://a.ch', n: '3', b: 'true' });
  });
});

describe('mayPreviewTemplate', () => {
  it('lets a tenant preview its own template and a system one', () => {
    expect(mayPreviewTemplate({ tenants: ['scs'] }, 'scs')).toBe(true);
    expect(mayPreviewTemplate({ tenants: ['system'] }, 'scs')).toBe(true);
  });
  it('refuses another tenant and a missing doc', () => {
    expect(mayPreviewTemplate({ tenants: ['p13'] }, 'scs')).toBe(false);
    expect(mayPreviewTemplate({}, 'scs')).toBe(false);
    expect(mayPreviewTemplate(undefined, 'scs')).toBe(false);
  });
});

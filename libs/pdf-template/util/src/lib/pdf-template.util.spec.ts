import '@angular/compiler';
import { describe, it, expect } from 'vitest';
import { newTemplate, newTemplateVersion, getTemplateIndex, prettifyJson } from './pdf-template.util';

describe('newTemplate', () => {
  it('sets tenants from tenantId', () => {
    const t = newTemplate('tenant1');
    expect(t.tenants).toEqual(['tenant1']);
  });

  it('has default status draft', () => {
    const t = newTemplate('tenant1');
    expect(t.status).toBe('draft');
  });

  it('has default outputFormat pdf', () => {
    const t = newTemplate('tenant1');
    expect(t.defaultOutputFormat).toBe('pdf');
  });
});

describe('newTemplateVersion', () => {
  it('creates version 1 by default', () => {
    const v = newTemplateVersion();
    expect(v.version).toBe(1);
  });

  it('creates version with status draft', () => {
    const v = newTemplateVersion();
    expect(v.status).toBe('draft');
  });
});

describe('prettifyJson', () => {
  it('indents valid compact JSON with 2 spaces', () => {
    expect(prettifyJson('{"a":1}')).toBe('{\n  "a": 1\n}');
  });

  it('returns invalid JSON unchanged', () => {
    expect(prettifyJson('not json')).toBe('not json');
  });

  it('returns empty string unchanged', () => {
    expect(prettifyJson('')).toBe('');
  });
});

describe('getTemplateIndex', () => {
  it('includes name in index', () => {
    const t = newTemplate('t1');
    t.name = 'Rechnung Standard';
    const idx = getTemplateIndex(t);
    expect(idx).toContain('Rechnung Standard');
  });

  it('includes category in index', () => {
    const t = newTemplate('t1');
    t.category = 'invoice';
    const idx = getTemplateIndex(t);
    expect(idx).toContain('invoice');
  });
});

import '@angular/compiler';
import { describe, it, expect } from 'vitest';
import { newTemplate, newTemplateVersion, getTemplateIndex } from './pdf-template.util';

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

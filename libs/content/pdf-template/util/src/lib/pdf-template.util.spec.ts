import '@angular/compiler';
import { describe, it, expect } from 'vitest';
import {
  copyTemplate, copyTemplateVersion, newTemplate, newTemplateVersion, getTemplateIndex, prettifyJson,
} from './pdf-template.util';

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

describe('copyTemplate', () => {
  function source() {
    const t = newTemplate('tenant1');
    t.okey = 'src1';
    t.name = 'Rechnung';
    t.category = 'invoice';
    t.language = 'fr';
    t.defaultOutputFormat = 'docx';
    t.attachQrSlip = true;
    t.sampleData = '{"a":1}';
    t.currentVersion = 3;
    t.draftVersion = 4;
    t.status = 'published';
    t.isArchived = true;
    t.createdAt = '2026-01-01';
    t.createdBy = 'u1';
    t.updatedAt = '2026-02-02';
    t.updatedBy = 'u2';
    return t;
  }

  it('drops the okey so a fresh document id is generated', () => {
    expect(copyTemplate(source(), '(Kopie)').okey).toBe('');
  });

  it('appends the suffix to the name', () => {
    expect(copyTemplate(source(), '(Kopie)').name).toBe('Rechnung (Kopie)');
  });

  it('keeps the settings of the source', () => {
    const c = copyTemplate(source(), '(Kopie)');
    expect(c.category).toBe('invoice');
    expect(c.language).toBe('fr');
    expect(c.defaultOutputFormat).toBe('docx');
    expect(c.attachQrSlip).toBe(true);
    expect(c.sampleData).toBe('{"a":1}');
  });

  it('starts as an unpublished draft without version history', () => {
    const c = copyTemplate(source(), '(Kopie)');
    expect(c.status).toBe('draft');
    expect(c.currentVersion).toBe(0);
    expect(c.draftVersion).toBeUndefined();
    expect(c.isArchived).toBe(false);
  });

  it('clears the audit fields', () => {
    const c = copyTemplate(source(), '(Kopie)');
    expect(c.createdAt).toBe('');
    expect(c.createdBy).toBe('');
    expect(c.updatedAt).toBe('');
    expect(c.updatedBy).toBe('');
  });

  it('recomputes the index from the new name', () => {
    expect(copyTemplate(source(), '(Kopie)').index).toBe(
      getTemplateIndex(copyTemplate(source(), '(Kopie)'))
    );
    expect(copyTemplate(source(), '(Kopie)').index).toContain('Kopie');
  });

  it('leaves the source untouched', () => {
    const s = source();
    copyTemplate(s, '(Kopie)');
    expect(s.okey).toBe('src1');
    expect(s.name).toBe('Rechnung');
    expect(s.currentVersion).toBe(3);
  });

  it('tolerates an empty suffix', () => {
    expect(copyTemplate(source(), '').name).toBe('Rechnung');
  });
});

describe('copyTemplateVersion', () => {
  function sourceVersion() {
    const v = newTemplateVersion(7);
    v.html = '<p>{{name}}</p>';
    v.css = 'p { color: red; }';
    v.partials = { header: '<h1>h</h1>' };
    v.assets = [{ key: 'a1', storagePath: 'p/a1.png', mimeType: 'image/png' }];
    v.status = 'published';
    v.changelog = 'initial';
    v.publishedAt = '2026-01-01';
    v.publishedBy = 'u1';
    return v;
  }

  it('copies the content into version 1 by default', () => {
    const c = copyTemplateVersion(sourceVersion());
    expect(c.version).toBe(1);
    expect(c.okey).toBe('1');
    expect(c.html).toBe('<p>{{name}}</p>');
    expect(c.css).toBe('p { color: red; }');
    expect(c.partials).toEqual({ header: '<h1>h</h1>' });
    expect(c.assets).toEqual([{ key: 'a1', storagePath: 'p/a1.png', mimeType: 'image/png' }]);
  });

  it('resets the publication state to draft', () => {
    const c = copyTemplateVersion(sourceVersion());
    expect(c.status).toBe('draft');
    expect(c.changelog).toBe('');
    expect(c.publishedAt).toBe('');
    expect(c.publishedBy).toBe('');
  });

  it('does not share the partials and assets containers with the source', () => {
    const s = sourceVersion();
    const c = copyTemplateVersion(s);
    c.partials['footer'] = '<p>f</p>';
    c.assets.push({ key: 'a2', storagePath: 'p/a2.png', mimeType: 'image/png' });
    expect(Object.keys(s.partials)).toEqual(['header']);
    expect(s.assets).toHaveLength(1);
  });

  it('accepts an explicit version number', () => {
    expect(copyTemplateVersion(sourceVersion(), 5).version).toBe(5);
  });
});

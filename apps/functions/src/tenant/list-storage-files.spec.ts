import { describe, expect, it } from 'vitest';

import { toTenantStorageFiles, type StorageObject } from './list-storage-files';

function obj(name: string, metadata: StorageObject['metadata'] = {}): StorageObject {
  return { name, metadata };
}

describe('toTenantStorageFiles', () => {
  it('excludes the CF-only private/ export prefix', () => {
    const files = toTenantStorageFiles([
      obj('tenant/scs/private/exports/owner_scs-20260809.zip'),
      obj('tenant/scs/document/report.pdf'),
    ], 'scs');

    expect(files.map(f => f.fullPath)).toEqual(['tenant/scs/document/report.pdf']);
  });

  it('excludes folder placeholders, which have no document by design', () => {
    const files = toTenantStorageFiles([obj('tenant/scs/document/'), obj('tenant/scs/a.jpg')], 'scs');

    expect(files.map(f => f.fullPath)).toEqual(['tenant/scs/a.jpg']);
  });

  it('maps metadata, coercing the string size GCS returns to a number', () => {
    const [file] = toTenantStorageFiles([obj('tenant/scs/a.jpg', {
      size: '2048', contentType: 'image/jpeg',
      timeCreated: '2026-08-09T10:00:00.000Z', updated: '2026-08-09T11:00:00.000Z', md5Hash: 'abc==',
    })], 'scs');

    expect(file).toEqual({
      fullPath: 'tenant/scs/a.jpg', size: 2048, contentType: 'image/jpeg',
      timeCreated: '2026-08-09T10:00:00.000Z', updated: '2026-08-09T11:00:00.000Z', md5Hash: 'abc==',
    });
  });

  it('defaults every missing metadata field instead of emitting undefined', () => {
    const [file] = toTenantStorageFiles([obj('tenant/scs/a.jpg')], 'scs');

    expect(file).toEqual({
      fullPath: 'tenant/scs/a.jpg', size: 0, contentType: '', timeCreated: '', updated: '', md5Hash: '',
    });
  });

  it('never returns another tenant\'s objects', () => {
    const files = toTenantStorageFiles([obj('tenant/p13/document/x.pdf'), obj('tenant/scs/a.jpg')], 'scs');

    expect(files.map(f => f.fullPath)).toEqual(['tenant/scs/a.jpg']);
  });
});

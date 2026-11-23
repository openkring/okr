import { Injector, runInInjectionContext } from '@angular/core';
import { of } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CategoryListModel } from '@okr/shared-models';
import { getItemLabel, getSystemQuery, toI18nRef } from '@okr/shared-util-core';

vi.mock('@okr/shared-data-access', () => ({ FirestoreService: class {} }));
vi.mock('./app.store', () => ({ AppStore: class {} }));

import { FirestoreService } from '@okr/shared-data-access';
import { AppStore } from './app.store';
import { TenantLabelService } from './tenant-label.service';

const user = { okey: 'u1' };
const firestore = { searchData: vi.fn(), createModel: vi.fn(), updateModel: vi.fn() };

function service(): TenantLabelService {
  const injector = Injector.create({ providers: [
    { provide: FirestoreService, useValue: firestore },
    { provide: AppStore, useValue: { currentUser: () => user } },
  ] });
  return runInInjectionContext(injector, () => new TenantLabelService());
}

function refOfItem(name: string) {
  const list = new CategoryListModel('scs');
  Object.assign(list, { name: 'address_channel', i18n: '@subject/address/feature', translateItems: true });
  const ref = toI18nRef(getItemLabel(list, name));
  if (!ref) throw new Error('no ref');
  return ref;
}

describe('TenantLabelService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    firestore.searchData.mockReturnValue(of([]));
  });

  it('looks the row up by module and key within the tenant', async () => {
    const row = { okey: 'r1' };
    firestore.searchData.mockReturnValue(of([row]));
    expect(await service().findOverride('tag', 'ezs', 'scs')).toBe(row);
    expect(firestore.searchData).toHaveBeenCalledWith('i18nTenantOverride',
      [...getSystemQuery('scs'), { key: 'module', operator: '==', value: 'tag' }, { key: 'key', operator: '==', value: 'ezs' }], 'key', 'asc');
  });

  it('creates the row of a new list item with module = scope and key = <list>.<item>.label', async () => {
    const ref = refOfItem('pager');
    await service().saveOverride(ref.module, ref.key, 'scs', { de: ' Pager ', en: 'Pager' }, undefined, 'conf', 'error');
    expect(firestore.createModel).toHaveBeenCalledWith('i18nTenantOverride', expect.objectContaining({
      okey: '', tenantId: 'scs', tenants: ['scs'], module: 'subject/address/feature', key: 'address_channel.pager.label',
      de: 'Pager', en: 'Pager', fr: '', es: '', it: '',
    }), 'conf', 'error', user);
    expect(firestore.updateModel).not.toHaveBeenCalled();
  });

  it('updates an existing row in place, also to empty labels', async () => {
    const existing = { okey: 'r1', tenantId: 'scs', tenants: ['scs'], module: 'tag', key: 'old', de: 'Alt' };
    await service().saveOverride('tag', 'new', 'scs', { de: '' }, existing as never, 'conf', 'error');
    expect(firestore.updateModel).toHaveBeenCalledWith('i18nTenantOverride',
      expect.objectContaining({ okey: 'r1', key: 'new', de: '' }), false, 'conf', 'error', user);
    expect(firestore.createModel).not.toHaveBeenCalled();
  });

  it('writes nothing when nothing is entered and nothing is stored', async () => {
    await service().saveOverride('tag', 'x', 'scs', { de: '  ' });
    expect(firestore.createModel).not.toHaveBeenCalled();
    expect(firestore.updateModel).not.toHaveBeenCalled();
  });
});

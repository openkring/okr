import { Injector, runInInjectionContext } from '@angular/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CategoryListModel } from '@okr/shared-models';
import { getItemLabel, getSystemQuery, toI18nRef } from '@okr/shared-util-core';

vi.mock('@okr/shared-data-access', () => ({ FirestoreService: class {} }));
vi.mock('@okr/shared-i18n', () => ({ I18nService: class {} }));
vi.mock('./app.store', () => ({ AppStore: class {} }));

import { FirestoreService } from '@okr/shared-data-access';
import { I18nService } from '@okr/shared-i18n';
import { AppStore } from './app.store';
import { TenantLabelService } from './tenant-label.service';

const user = { okey: 'u1' };
const i18n = { lacksTranslation: vi.fn() };
const firestore = { getDataOnce: vi.fn(), createModel: vi.fn(), updateModel: vi.fn() };

function service(): TenantLabelService {
  const injector = Injector.create({ providers: [
    { provide: FirestoreService, useValue: firestore },
    { provide: I18nService, useValue: i18n },
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
    firestore.getDataOnce.mockResolvedValue([]);
  });

  it('looks the row up by module and key within the tenant', async () => {
    const row = { okey: 'r1' };
    firestore.getDataOnce.mockResolvedValue([row]);
    expect(await service().findOverride('tag', 'ezs', 'scs')).toBe(row);
    expect(firestore.getDataOnce).toHaveBeenCalledWith('i18nTenantOverride',
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

  describe('lacksLabel', () => {
    const key = '@subject/address/feature.address_channel.pager.label';
    it('is true when neither the bundle nor a row names the key', async () => {
      i18n.lacksTranslation.mockResolvedValue(true);
      expect(await service().lacksLabel(key, 'scs')).toBe(true);
    });
    it('is false when the bundle names it', async () => {
      i18n.lacksTranslation.mockResolvedValue(false);
      expect(await service().lacksLabel(key, 'scs')).toBe(false);
    });
    it('is false when the tenant already has a row', async () => {
      i18n.lacksTranslation.mockResolvedValue(true);
      firestore.getDataOnce.mockResolvedValue([{ okey: 'r1' }]);
      expect(await service().lacksLabel(key, 'scs')).toBe(false);
    });
    it('is false for a raw name', async () => {
      i18n.lacksTranslation.mockResolvedValue(true);
      expect(await service().lacksLabel('pager', 'scs')).toBe(false);
    });
  });
});

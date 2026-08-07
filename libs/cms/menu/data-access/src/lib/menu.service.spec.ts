import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';

import { ENV } from '@okr/shared-config';
import { FirestoreService } from '@okr/shared-data-access';
import { I18nService } from '@okr/shared-i18n';
import { MenuItemCollection, MenuItemModel } from '@okr/shared-models';

import { MenuService } from './menu.service';

const tenantId = 'p13';

function createFirestoreMock() {
  return {
    createModel: vi.fn().mockResolvedValue('new-id'),
    updateModel: vi.fn().mockResolvedValue('updated-id'),
    updateObject: vi.fn().mockResolvedValue('shared'),
    deleteModel: vi.fn().mockResolvedValue(undefined),
    searchData: vi.fn().mockReturnValue(of([]))
  };
}

const i18nMock = {
  translateAll: vi.fn(() => ({
    create_conf: () => 'create_conf', create_error: () => 'create_error',
    update_conf: () => 'update_conf', update_error: () => 'update_error',
    delete_conf: () => 'delete_conf', delete_error: () => 'delete_error'
  }))
};

describe('MenuService', () => {
  let firestore: ReturnType<typeof createFirestoreMock>;
  let service: MenuService;

  beforeEach(() => {
    firestore = createFirestoreMock();
    TestBed.configureTestingModule({
      providers: [
        MenuService,
        { provide: ENV, useValue: { tenantId } },
        { provide: FirestoreService, useValue: firestore },
        { provide: I18nService, useValue: i18nMock }
      ]
    });
    service = TestBed.inject(MenuService);
  });

  it('create() writes to the menuitem collection and returns the new id', async () => {
    const item = new MenuItemModel(tenantId);
    item.name = 'home';
    const id = await service.create(item, undefined);
    expect(id).toBe('new-id');
    expect(firestore.createModel).toHaveBeenCalledTimes(1);
    expect(firestore.createModel.mock.calls[0][0]).toBe(MenuItemCollection);
    expect(firestore.createModel.mock.calls[0][1]).toBe(item);
    expect(typeof item.index).toBe('string'); // index recomputed before write
  });

  it('update() updates the collection (not overwrite) and returns the id', async () => {
    const item = new MenuItemModel(tenantId);
    item.okey = 'm1';
    const id = await service.update(item);
    expect(id).toBe('updated-id');
    expect(firestore.updateModel).toHaveBeenCalledTimes(1);
    expect(firestore.updateModel.mock.calls[0][0]).toBe(MenuItemCollection);
    expect(firestore.updateModel.mock.calls[0][2]).toBe(false); // not a full overwrite
  });

  // Fork on first edit (D-BB-8): editing a menu doc shared with other tenants must not
  // rename it for them.
  describe('fork on edit', () => {
    function sharedItem(): MenuItemModel {
      const item = new MenuItemModel(tenantId);
      item.okey = 'calevent-all';
      item.name = 'calevent-all';
      item.tenants = ['scs', tenantId, 'okr'];
      return item;
    }

    it('copies the shared doc to a tenant-private one and detaches this tenant', async () => {
      const id = await service.update(sharedItem());

      expect(firestore.updateModel).not.toHaveBeenCalled();
      expect(id).toBe('new-id');

      const forked = firestore.createModel.mock.calls[0][1] as MenuItemModel;
      expect(forked.okey).toBe('calevent-all_p13');
      expect(forked.name).toBe('calevent-all');   // parents reference children by name
      expect(forked.forkedFrom).toBe('calevent-all');

      const [collection, key, patch] = firestore.updateObject.mock.calls[0];
      expect(collection).toBe(MenuItemCollection);
      expect(key).toBe('calevent-all');
      expect(patch).toEqual({ tenants: ['scs', 'okr'] });   // only this tenant dropped
    });

    it('leaves the shared doc alone when the copy fails', async () => {
      firestore.createModel.mockResolvedValueOnce(undefined);
      const id = await service.update(sharedItem());
      expect(id).toBeUndefined();
      expect(firestore.updateObject).not.toHaveBeenCalled();
    });

    it('updates in place when the doc belongs to this tenant only', async () => {
      const item = sharedItem();
      item.tenants = [tenantId];
      await service.update(item);
      expect(firestore.createModel).not.toHaveBeenCalled();
      expect(firestore.updateModel).toHaveBeenCalledTimes(1);
    });

    it('updates in place when this tenant is not on the doc (nothing to detach)', async () => {
      const item = sharedItem();
      item.tenants = ['system'];
      await service.update(item);
      expect(firestore.createModel).not.toHaveBeenCalled();
      expect(firestore.updateModel).toHaveBeenCalledTimes(1);
    });
  });

  it('delete() (soft archive) calls deleteModel on the collection', async () => {
    const item = new MenuItemModel(tenantId);
    item.okey = 'm1';
    await service.delete(item);
    expect(firestore.deleteModel).toHaveBeenCalledTimes(1);
    expect(firestore.deleteModel.mock.calls[0][0]).toBe(MenuItemCollection);
  });

  it('list() queries the collection with the given ordering', () => {
    service.list('name', 'asc');
    expect(firestore.searchData).toHaveBeenCalledTimes(1);
    const [collection, , orderBy, sortOrder] = firestore.searchData.mock.calls[0];
    expect(collection).toBe(MenuItemCollection);
    expect(orderBy).toBe('name');
    expect(sortOrder).toBe('asc');
  });

  it('propagates errors from the underlying write', async () => {
    firestore.createModel.mockRejectedValueOnce(new Error('boom'));
    await expect(service.create(new MenuItemModel(tenantId), undefined)).rejects.toThrow('boom');
  });
});

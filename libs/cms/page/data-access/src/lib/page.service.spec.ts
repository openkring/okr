import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';

import { ENV } from '@bk2/shared-config';
import { FirestoreService } from '@bk2/shared-data-access';
import { I18nService } from '@bk2/shared-i18n';
import { PageCollection, PageModel } from '@bk2/shared-models';

import { PageService } from './page.service';

const tenantId = 'p13';

function createFirestoreMock() {
  return {
    createModel: vi.fn().mockResolvedValue('new-id'),
    updateModel: vi.fn().mockResolvedValue('updated-id'),
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

describe('PageService', () => {
  let firestore: ReturnType<typeof createFirestoreMock>;
  let service: PageService;

  beforeEach(() => {
    firestore = createFirestoreMock();
    TestBed.configureTestingModule({
      providers: [
        PageService,
        { provide: ENV, useValue: { tenantId } },
        { provide: FirestoreService, useValue: firestore },
        { provide: I18nService, useValue: i18nMock }
      ]
    });
    service = TestBed.inject(PageService);
  });

  it('create() writes to the page collection and returns the new id', async () => {
    const page = new PageModel(tenantId);
    page.name = 'home';
    const id = await service.create(page, undefined);
    expect(id).toBe('new-id');
    expect(firestore.createModel).toHaveBeenCalledTimes(1);
    expect(firestore.createModel.mock.calls[0][0]).toBe(PageCollection);
    expect(firestore.createModel.mock.calls[0][1]).toBe(page);
    expect(typeof page.index).toBe('string');
  });

  it('update() updates the collection (not overwrite) and returns the id', async () => {
    const page = new PageModel(tenantId);
    page.bkey = 'p1';
    const id = await service.update(page);
    expect(id).toBe('updated-id');
    expect(firestore.updateModel).toHaveBeenCalledTimes(1);
    expect(firestore.updateModel.mock.calls[0][0]).toBe(PageCollection);
    expect(firestore.updateModel.mock.calls[0][2]).toBe(false);
  });

  it('delete() (soft archive) calls deleteModel on the collection', async () => {
    const page = new PageModel(tenantId);
    page.bkey = 'p1';
    await service.delete(page);
    expect(firestore.deleteModel).toHaveBeenCalledTimes(1);
    expect(firestore.deleteModel.mock.calls[0][0]).toBe(PageCollection);
  });

  it('list() queries the collection with the given ordering', () => {
    service.list('name', 'desc');
    expect(firestore.searchData).toHaveBeenCalledTimes(1);
    const [collection, , orderBy, sortOrder] = firestore.searchData.mock.calls[0];
    expect(collection).toBe(PageCollection);
    expect(orderBy).toBe('name');
    expect(sortOrder).toBe('desc');
  });

  it('propagates errors from the underlying write', async () => {
    firestore.updateModel.mockRejectedValueOnce(new Error('boom'));
    const page = new PageModel(tenantId);
    page.bkey = 'p1';
    await expect(service.update(page)).rejects.toThrow('boom');
  });
});

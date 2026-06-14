import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom, of } from 'rxjs';

import { ENV } from '@bk2/shared-config';
import { FirestoreService } from '@bk2/shared-data-access';
import { I18nService } from '@bk2/shared-i18n';
import { IFRAME_SECTION_SHAPE, SectionCollection, SectionModel } from '@bk2/shared-models';

import { SectionService } from './section.service';

const tenantId = 'p13';

function section(): SectionModel {
  return { ...IFRAME_SECTION_SHAPE, bkey: 's1', tenants: [tenantId] } as SectionModel;
}

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

describe('SectionService', () => {
  let firestore: ReturnType<typeof createFirestoreMock>;
  let service: SectionService;

  beforeEach(() => {
    firestore = createFirestoreMock();
    TestBed.configureTestingModule({
      providers: [
        SectionService,
        { provide: ENV, useValue: { tenantId } },
        { provide: FirestoreService, useValue: firestore },
        { provide: I18nService, useValue: i18nMock }
      ]
    });
    service = TestBed.inject(SectionService);
  });

  it('create() writes to the section collection and returns the new id', async () => {
    const id = await service.create(section(), undefined);
    expect(id).toBe('new-id');
    expect(firestore.createModel).toHaveBeenCalledTimes(1);
    expect(firestore.createModel.mock.calls[0][0]).toBe(SectionCollection);
  });

  it('update() updates the collection (not overwrite) and returns the id', async () => {
    const id = await service.update(section());
    expect(id).toBe('updated-id');
    expect(firestore.updateModel).toHaveBeenCalledTimes(1);
    expect(firestore.updateModel.mock.calls[0][0]).toBe(SectionCollection);
    expect(firestore.updateModel.mock.calls[0][2]).toBe(false);
  });

  it('delete() (soft archive) calls deleteModel on the collection', async () => {
    await service.delete(section());
    expect(firestore.deleteModel).toHaveBeenCalledTimes(1);
    expect(firestore.deleteModel.mock.calls[0][0]).toBe(SectionCollection);
  });

  it('list() queries the collection with the given ordering', () => {
    service.list('name', 'asc');
    expect(firestore.searchData).toHaveBeenCalledTimes(1);
    expect(firestore.searchData.mock.calls[0][0]).toBe(SectionCollection);
  });

  it('searchByKeys() returns an empty list without hitting Firestore when no keys are given', async () => {
    const result = await firstValueFrom(service.searchByKeys([]));
    expect(result).toEqual([]);
  });

  it('searchByKeys() caps the number of read sections to the given limit', async () => {
    const sections = ['a', 'b', 'c'].map((k) => ({ ...IFRAME_SECTION_SHAPE, bkey: k }));
    firestore.searchData.mockReturnValue(of(sections));
    const result = await firstValueFrom(service.searchByKeys(['a', 'b', 'c'], 2));
    expect(result.map((s) => s.bkey)).toEqual(['a', 'b']);
  });

  it('propagates errors from the underlying write', async () => {
    firestore.deleteModel.mockRejectedValueOnce(new Error('boom'));
    await expect(service.delete(section())).rejects.toThrow('boom');
  });
});

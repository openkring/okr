import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom, of } from 'rxjs';

import { FirestoreService } from '@okr/shared-data-access';
import { I18nService } from '@okr/shared-i18n';
import { WebsiteCollection, WebsiteModel, WebsiteNode } from '@okr/shared-models';

import { WebsiteService } from './website.service';

function createFirestoreMock() {
  return {
    readModel: vi.fn().mockReturnValue(of(undefined)),
    createModel: vi.fn().mockResolvedValue('scs'),
    updateModel: vi.fn().mockResolvedValue('scs')
  };
}

const i18nMock = {
  translateAll: vi.fn(() => ({
    create_conf: () => 'create_conf', create_error: () => 'create_error',
    update_conf: () => 'update_conf', update_error: () => 'update_error'
  }))
};

describe('WebsiteService', () => {
  let firestore: ReturnType<typeof createFirestoreMock>;
  let service: WebsiteService;

  beforeEach(() => {
    firestore = createFirestoreMock();
    TestBed.configureTestingModule({
      providers: [
        WebsiteService,
        { provide: FirestoreService, useValue: firestore },
        { provide: I18nService, useValue: i18nMock }
      ]
    });
    service = TestBed.inject(WebsiteService);
  });

  it('read() reads websites/{siteId}', async () => {
    const site = new WebsiteModel('scs');
    firestore.readModel.mockReturnValue(of(site));
    expect(await firstValueFrom(service.read('scs'))).toBe(site);
    expect(firestore.readModel).toHaveBeenCalledWith(WebsiteCollection, 'scs');
  });

  it('read() of an empty siteId yields undefined without a read', async () => {
    expect(await firstValueFrom(service.read(''))).toBeUndefined();
    expect(firestore.readModel).not.toHaveBeenCalled();
  });

  it('create() stores the site under its own okey (siteId)', async () => {
    const site = new WebsiteModel('scs');
    site.okey = 'scs';
    expect(await service.create(site)).toBe('scs');
    const call = firestore.createModel.mock.calls[0];
    expect(call[0]).toBe(WebsiteCollection);
    expect(call[1]).toBe(site);
    expect(call[1].okey).toBe('scs');
  });

  it('saveTree() writes the patched nav and a fresh draftChangedAt in one updateModel', async () => {
    const site = new WebsiteModel('scs');
    site.okey = 'scs';
    site.homePageKey = 'old';
    const nav: WebsiteNode[] = [{ id: 'n1', type: 'page', label: 'Home', pageKey: 'home', slug: 'home' }];
    const before = Date.now();
    await service.saveTree(site, { nav, homePageKey: 'home' });
    expect(firestore.updateModel).toHaveBeenCalledTimes(1);
    const [coll, model] = firestore.updateModel.mock.calls[0];
    expect(coll).toBe(WebsiteCollection);
    expect(model.nav).toEqual(nav);
    expect(model.homePageKey).toBe('home');
    expect(Date.parse(model.draftChangedAt)).toBeGreaterThanOrEqual(before);
    expect(site.homePageKey).toBe('old'); // caller's object is not mutated
  });

  it('saveTree() leaves footer and homePageKey alone when the patch omits them', async () => {
    const site = new WebsiteModel('scs');
    site.okey = 'scs';
    site.homePageKey = 'h';
    site.footer = [{ id: 'f', type: 'menu', label: 'F' }];
    await service.saveTree(site, { nav: [] });
    const model = firestore.updateModel.mock.calls[0][1];
    expect(model.footer).toEqual(site.footer);
    expect(model.homePageKey).toBe('h');
  });
});

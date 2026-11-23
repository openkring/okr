import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { I18nService } from '@okr/shared-i18n';
import { AppConfigCollection } from '@okr/shared-models';

import { AppConfigService } from './app-config.service';
import { FirestoreService } from './firestore.service';

describe('AppConfigService.patch', () => {
  const updateObject = vi.fn(async (..._args: unknown[]) => _args[1] as string | undefined);
  let service: AppConfigService;

  beforeEach(() => {
    updateObject.mockClear();
    updateObject.mockImplementation(async (..._args: unknown[]) => _args[1] as string);
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        { provide: FirestoreService, useValue: { updateObject } },
        { provide: I18nService, useValue: { translateAll: (keys: Record<string, string>) => Object.fromEntries(Object.keys(keys).map((k) => [k, () => `t:${k}`])) } },
      ],
    });
    service = TestBed.inject(AppConfigService);
  });

  it('writes exactly the given fields, merged, with the update toast', async () => {
    const result = await service.patch('t1', { appName: 'Neu', showEmail: 'admin' });
    expect(result).toBe('t1');
    expect(updateObject).toHaveBeenCalledTimes(1);
    expect(updateObject).toHaveBeenCalledWith(AppConfigCollection, 't1', { appName: 'Neu', showEmail: 'admin' }, false, 't:update_conf');
  });

  it('never writes enabledFeatures', async () => {
    await service.patch('t1', { appName: 'Neu', enabledFeatures: ['core'] });
    expect(updateObject.mock.calls[0][2]).toEqual({ appName: 'Neu' });
  });

  it('does not call the database for nothing to write', async () => {
    expect(await service.patch('t1', {})).toBeUndefined();
    expect(await service.patch('t1', { enabledFeatures: ['core'] })).toBeUndefined();
    expect(await service.patch('t1', { appName: undefined })).toBeUndefined();
    expect(updateObject).not.toHaveBeenCalled();
  });

  it('reports a failed write as undefined', async () => {
    updateObject.mockResolvedValue(undefined);
    expect(await service.patch('t1', { appName: 'x' })).toBeUndefined();
  });
});

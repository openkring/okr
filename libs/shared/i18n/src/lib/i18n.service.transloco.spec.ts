import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideTransloco } from '@jsverse/transloco';
import { of, throwError } from 'rxjs';
import { beforeEach, describe, expect, it } from 'vitest';

import { I18nService } from './i18n.service';

describe('I18nService.lacksTranslation with the real Transloco', () => {
  let service: I18nService;
  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideTransloco({
          config: { availableLangs: ['de', 'en'], defaultLang: 'de', prodMode: true, failedRetries: 0 },
          loader: class {
            public getTranslation(path: string) {
              if (path.startsWith('gone')) return throwError(() => new Error('404'));
              return of(path === 'de' ? { tag: { ezs: 'EZS' } } : { gender: { male: { label: 'Mann' } } });
            }
          },
        }),
      ],
    });
    service = TestBed.inject(I18nService);
  });

  it('is false for a key of a path scope and of the main bundle', async () => {
    expect(await service.lacksTranslation('@subject/person/feature.gender.male.label')).toBe(false);
    expect(await service.lacksTranslation('@tag.ezs')).toBe(false);
  });

  it('is true for a missing key', async () => {
    expect(await service.lacksTranslation('@subject/person/feature.gender.other.label')).toBe(true);
    expect(await service.lacksTranslation('@tag.nope')).toBe(true);
  });

  it('is false for a raw name and for a scope that cannot be loaded', async () => {
    expect(await service.lacksTranslation('raw')).toBe(false);
    expect(await service.lacksTranslation('@gone/feature.a.label')).toBe(false);
  });
});

import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideTransloco, TranslocoService } from '@jsverse/transloco';
import { firstValueFrom, Observable, of, Subject, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { FirestoreService } from './firestore.service';
import { APP_STORE_MIN, I18nOverrideService } from './i18n-override.service';

// init() with the real TranslocoService; the user document arrives when the test says so.
const ROWS = [{ module: 'tag', key: 'pager', de: 'Pager', en: 'Beeper' }];

function setup(rows$: () => Observable<unknown[]> = () => of(ROWS)) {
  const user = signal<{ okey: string } | undefined>(undefined);
  const searchData = vi.fn(rows$);
  TestBed.configureTestingModule({
    providers: [
      provideZonelessChangeDetection(),
      provideTransloco({
        config: { availableLangs: ['de', 'en'], defaultLang: 'de', prodMode: true },
        loader: class { public getTranslation() { return of({ tag: { club: 'Anlass' } }); } },
      }),
      { provide: FirestoreService, useValue: { searchData } },
      { provide: APP_STORE_MIN, useValue: { currentUser: user, env: { tenantId: 'scs' } } },
    ],
  });
  const transloco = TestBed.inject(TranslocoService);
  const emitted: string[] = [];
  transloco.langChanges$.subscribe(lang => emitted.push(lang));
  return {
    user, searchData, transloco, emitted,
    service: TestBed.inject(I18nOverrideService),
    text: () => firstValueFrom(transloco.selectTranslate('tag.pager')),
  };
}

describe('I18nOverrideService.init', () => {
  beforeEach(() => TestBed.resetTestingModule());

  it('applies once when the user arrives later and the language stays the same', async () => {
    const { service, user, searchData, text } = setup();
    service.init();
    TestBed.tick();
    expect(searchData).not.toHaveBeenCalled();
    user.set({ okey: 'u1' });
    TestBed.tick();
    expect(searchData).toHaveBeenCalledTimes(1);
    expect(await text()).toBe('Pager');
  });

  it('applies once when the user is already there', async () => {
    const { service, user, searchData, text } = setup();
    user.set({ okey: 'u1' });
    service.init();
    TestBed.tick();
    expect(searchData).toHaveBeenCalledTimes(1);
    expect(await text()).toBe('Pager');
  });

  it('does not apply again when the user document is written', () => {
    const { service, user, searchData } = setup();
    service.init();
    user.set({ okey: 'u1' });
    TestBed.tick();
    user.set({ okey: 'u1' });
    TestBed.tick();
    expect(searchData).toHaveBeenCalledTimes(1);
  });

  it('applies once more for a new language and lets the old listener go', async () => {
    const live = { count: 0 };
    const { service, user, searchData, transloco, text } = setup(() => new Observable(observer => {
      live.count++;
      observer.next(ROWS);
      return () => { live.count--; };
    }));
    service.init();
    user.set({ okey: 'u1' });
    TestBed.tick();
    transloco.setActiveLang('en');
    expect(searchData).toHaveBeenCalledTimes(2);
    expect(live.count).toBe(1);
    expect(await text()).toBe('Beeper');
  });

  it('never reads without a user, also when the language changes', () => {
    const { service, searchData, transloco } = setup();
    service.init();
    TestBed.tick();
    transloco.setActiveLang('en');
    TestBed.tick();
    expect(searchData).not.toHaveBeenCalled();
  });

  it('closes its listener when the user signs out and reads again after the next sign-in', () => {
    const rows$ = new Subject<unknown[]>();
    const { service, user, searchData } = setup(() => rows$);
    service.init();
    user.set({ okey: 'u1' });
    TestBed.tick();
    expect(rows$.observed).toBe(true);
    user.set(undefined);
    TestBed.tick();
    expect(rows$.observed).toBe(false);
    user.set({ okey: 'u2' });
    TestBed.tick();
    expect(searchData).toHaveBeenCalledTimes(2);
  });

  // Regression: applying pushes the CURRENT language back through langChanges$; without the filter in
  // init() this re-entered forever and froze the tab right after login.
  it('emits the language once per snapshot and does not loop', () => {
    const rows$ = new Subject<unknown[]>();
    const { service, user, searchData, emitted } = setup(() => rows$);
    service.init();
    user.set({ okey: 'u1' });
    TestBed.tick();
    rows$.next(ROWS);
    rows$.next([...ROWS, { module: 'tag', key: 'b', de: 'B' }]);
    TestBed.tick();
    // the initial value, then one per snapshot
    expect(emitted).toEqual(['de', 'de', 'de']);
    expect(searchData).toHaveBeenCalledTimes(1);
  });

  it('skips a broken row, applies the others and goes on', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const rows$ = new Subject<unknown[]>();
    const { service, user, searchData, transloco, text } = setup(() => rows$);
    service.init();
    user.set({ okey: 'u1' });
    TestBed.tick();
    rows$.next([{ key: 'x', de: 'ohne Modul' }, ...ROWS]);
    expect(await text()).toBe('Pager');
    transloco.setActiveLang('en');
    expect(searchData).toHaveBeenCalledTimes(2);
    expect(log).toHaveBeenCalledTimes(1);
    log.mockRestore();
  });

  it('survives a failing read: the next language reads again', () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { service, user, searchData, transloco } = setup(() => throwError(() => new Error('boom')));
    service.init();
    user.set({ okey: 'u1' });
    TestBed.tick();
    transloco.setActiveLang('en');
    expect(searchData).toHaveBeenCalledTimes(2);
    log.mockRestore();
  });
});

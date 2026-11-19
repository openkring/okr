import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Injector, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { AppStore } from '@okr/shared-feature';
import { MenuItemModel, MenuType, StaticMenuConfig } from '@okr/shared-models';

import { MenuItemsStore } from './menu-items.store';
import { MenuLayout } from './menu-layout.service';

const tenantId = 'scs';
const HINT_KEY = `okr.menuType.${tenantId}`;
const HEIGHT_KEY = `okr.menuStaticHeight.${tenantId}`;
/** Longer than the debounce of `persistedSignal`, so a pending write has happened. */
const AFTER_DEBOUNCE_MS = 1000;

function storeHint(type: MenuType): void {
  localStorage.setItem(HINT_KEY, JSON.stringify({ v: type, t: Date.now() }));
}

function storedHint(): unknown {
  const raw = localStorage.getItem(HINT_KEY);
  return raw === null ? undefined : JSON.parse(raw).v;
}

function storedHeight(): unknown {
  const raw = localStorage.getItem(HEIGHT_KEY);
  return raw === null ? undefined : JSON.parse(raw).v;
}

function rootDoc(menuType?: MenuType, staticMenu?: StaticMenuConfig): MenuItemModel {
  const root = new MenuItemModel(tenantId);
  root.name = `main_${tenantId}`;
  root.action = 'main';
  root.menuType = menuType;
  root.staticMenu = staticMenu;
  return root;
}

describe('MenuLayout', () => {
  const menuItems = signal<MenuItemModel[] | undefined>(undefined);
  const createStore = vi.fn(() => ({ menuItems }));
  let onWidthChange: (event: { matches: boolean }) => void = () => undefined;

  /** jsdom has no matchMedia: define it (configurable) so the service reads this width; call before createLayout(). */
  function stubWidth(wide: boolean): void {
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      writable: true,
      value: vi.fn(() => ({
        matches: wide,
        addEventListener: (_: string, cb: (event: { matches: boolean }) => void) => { onWidthChange = cb; },
      })),
    });
  }

  /** Builds the service the way the shell does; the store exists only once `start()` asks for it. */
  function createLayout(): MenuLayout {
    const layout = TestBed.inject(MenuLayout);
    TestBed.tick();
    return layout;
  }

  /** Runs the effects and lets every debounced write of the hint reach localStorage. */
  function settle(): void {
    TestBed.tick();
    vi.advanceTimersByTime(AFTER_DEBOUNCE_MS);
  }

  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
    menuItems.set(undefined);
    createStore.mockClear();
    TestBed.configureTestingModule({
      providers: [
        { provide: AppStore, useValue: { tenantId: signal(tenantId) } },
        { provide: MenuItemsStore, useFactory: createStore },
      ],
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    delete (window as { matchMedia?: unknown }).matchMedia;
  });

  it('uses the stored hint until the root document has arrived', () => {
    storeHint('segmented');
    const layout = createLayout();
    layout.start();
    TestBed.tick();

    expect(layout.menuType()).toBe('segmented');
    expect(layout.barActive()).toBe(true);

    menuItems.set([rootDoc('left')]);
    TestBed.tick();

    expect(layout.menuType()).toBe('left');
    expect(layout.barActive()).toBe(false);
  });

  it('does not overwrite the stored hint while the list is loading', () => {
    storeHint('top');
    const layout = createLayout();
    layout.start();
    settle();

    expect(menuItems()).toBeUndefined();
    expect(layout.menuType()).toBe('top');
    expect(storedHint()).toBe('top');
  });

  it('does not overwrite the stored hint with a list that holds no root document', () => {
    storeHint('top');
    const layout = createLayout();
    layout.start();
    menuItems.set([]);
    settle();

    expect(layout.menuType()).toBe('top');
    expect(storedHint()).toBe('top');
  });

  it('stores the type of the root document, an absent one as left', () => {
    storeHint('top');
    const layout = createLayout();
    layout.start();
    menuItems.set([rootDoc('segmented')]);
    settle();
    expect(storedHint()).toBe('segmented');

    menuItems.set([rootDoc(undefined)]);
    settle();
    expect(storedHint()).toBe('left');
    expect(layout.menuType()).toBe('left');
  });

  it('never reaches the menu list before start()', () => {
    storeHint('segmented');
    const layout = createLayout();
    settle();

    expect(layout.menuType()).toBe('segmented');
    expect(createStore).not.toHaveBeenCalled();
  });

  it('start() is idempotent: the store is looked up once', () => {
    const layout = createLayout();
    const get = vi.spyOn(TestBed.inject(Injector), 'get');

    layout.start();
    layout.start();
    layout.start();

    expect(get.mock.calls.filter(([token]) => token === MenuItemsStore)).toHaveLength(1);
    expect(createStore).toHaveBeenCalledTimes(1);
  });

  it('static on a wide screen replaces the sidebar but is no bar', () => {
    stubWidth(true); const layout = createLayout(); layout.start();
    menuItems.set([rootDoc('static')]); TestBed.tick();
    expect(layout.staticActive()).toBe(true);
    expect(layout.barActive()).toBe(false);
    expect(layout.sidebarReplaced()).toBe(true);
  });

  it('static on a narrow screen is the sidebar', () => {
    stubWidth(false); const layout = createLayout(); layout.start();
    menuItems.set([rootDoc('static')]); TestBed.tick();
    expect(layout.sidebarReplaced()).toBe(false);
    expect(layout.barTop()).toBeNull();
  });

  it('barTop follows the measured static height', () => {
    stubWidth(true); const layout = createLayout(); layout.start();
    menuItems.set([rootDoc('static')]); layout.setStaticHeight(212); TestBed.tick();
    expect(layout.barTop()).toBe('calc(212px + var(--ion-safe-area-top, 0px))');
  });

  it('drops the offset at once when the type leaves static or the screen narrows', () => {
    stubWidth(true); const layout = createLayout(); layout.start();
    menuItems.set([rootDoc('static')]); layout.setStaticHeight(212); TestBed.tick();
    onWidthChange({ matches: false }); TestBed.tick();
    expect(layout.barTop()).toBeNull();
    onWidthChange({ matches: true }); menuItems.set([rootDoc('left')]); TestBed.tick();
    expect(layout.barTop()).toBeNull();
  });

  it('forgets the measured height when static ends; re-entering shows the stored one, not 0', () => {
    stubWidth(true); const layout = createLayout(); layout.start();
    menuItems.set([rootDoc('static')]); layout.setStaticHeight(212); settle();
    menuItems.set([rootDoc('left')]); TestBed.tick();
    menuItems.set([rootDoc('static')]); TestBed.tick();
    expect(layout.barTop()).toBe('calc(212px + var(--ion-safe-area-top, 0px))');
  });

  it('uses the stored height as barTop before any measurement', () => {
    localStorage.setItem(HEIGHT_KEY, JSON.stringify({ v: 188, t: Date.now() }));
    storeHint('static');
    stubWidth(true); const layout = createLayout(); layout.start();
    expect(layout.barTop()).toBe('calc(188px + var(--ion-safe-area-top, 0px))');
  });

  it('writes a measurement after the debounce, and never stores 0 when static ends', () => {
    stubWidth(true); const layout = createLayout(); layout.start();
    menuItems.set([rootDoc('static')]); layout.setStaticHeight(150); settle();
    expect(storedHeight()).toBe(150);
    layout.setStaticHeight(0); menuItems.set([rootDoc('left')]); settle();
    expect(storedHeight()).toBe(150);
  });

  it('resolves the static config with defaults', () => {
    stubWidth(true); const layout = createLayout(); layout.start();
    menuItems.set([rootDoc('static', { bulletShape: 'round' })]); TestBed.tick();
    expect(layout.staticMenu()).toMatchObject({ bulletShape: 'round', bulletSize: 12 });
  });
});

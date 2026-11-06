import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Injector, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { AppStore } from '@okr/shared-feature';
import { MenuItemModel, MenuType } from '@okr/shared-models';

import { MenuItemsStore } from './menu-items.store';
import { MenuLayout } from './menu-layout.service';

const tenantId = 'scs';
const HINT_KEY = `okr.menuType.${tenantId}`;
/** Longer than the debounce of `persistedSignal`, so a pending write has happened. */
const AFTER_DEBOUNCE_MS = 1000;

function storeHint(type: MenuType): void {
  localStorage.setItem(HINT_KEY, JSON.stringify({ v: type, t: Date.now() }));
}

function storedHint(): unknown {
  const raw = localStorage.getItem(HINT_KEY);
  return raw === null ? undefined : JSON.parse(raw).v;
}

function rootDoc(menuType?: MenuType): MenuItemModel {
  const root = new MenuItemModel(tenantId);
  root.name = `main_${tenantId}`;
  root.action = 'main';
  root.menuType = menuType;
  return root;
}

describe('MenuLayout', () => {
  const menuItems = signal<MenuItemModel[] | undefined>(undefined);
  const createStore = vi.fn(() => ({ menuItems }));

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
});

import { effect, inject } from '@angular/core';
import { patchState, signalStore, withHooks, withMethods, withProps, withState } from '@ngrx/signals';

import { I18nService } from '@okr/shared-i18n';
import {
  DEFAULT_LUPE_SETTINGS, LUPE_I18N_KEYS, LUPE_STORAGE_KEY, LupeI18n, LupeSettings, restoreLupe, serializeLupe,
} from '@okr/instruments-lupe-util';

function readStorage(): string | null {
  try {
    return localStorage.getItem(LUPE_STORAGE_KEY);
  } catch {
    return null;
  }
}

function writeStorage(value: string): void {
  try {
    localStorage.setItem(LUPE_STORAGE_KEY, value);
  } catch {
    // storage blocked (private mode, site data off): settings simply stay in memory
  }
}

/**
 * Owns the Lupe's per-device settings (last zoom, flashlight on/off) and its labels. The camera
 * stream itself is DOM-bound and lives in `LupePage`. Component-provided.
 */
export const LupeStore = signalStore(
  withState<LupeSettings>({ ...DEFAULT_LUPE_SETTINGS }),
  withProps(() => ({
    i18nService: inject(I18nService),
  })),
  withProps((store) => ({
    i18n: store.i18nService.translateAll(LUPE_I18N_KEYS) as LupeI18n,
  })),
  withMethods((store) => ({
    setZoom: (zoom: number): void => patchState(store, { zoom }),
    setTorch: (torch: boolean): void => patchState(store, { torch }),
  })),
  withHooks({
    onInit(store) {
      patchState(store, restoreLupe(readStorage()));
      effect(() => writeStorage(serializeLupe({ zoom: store.zoom(), torch: store.torch() })));
    },
  }),
);

import { computed, effect, inject } from '@angular/core';
import { ToastController } from '@ionic/angular/standalone';
import { patchState, signalStore, withComputed, withHooks, withMethods, withProps, withState } from '@ngrx/signals';

import { I18nService } from '@okr/shared-i18n';
import { copyToClipboardWithConfirmation } from '@okr/shared-util-angular';
import {
  CALC_STORAGE_KEY, CALCULATOR_I18N_KEYS, CalcKey, CalcProfile, calcView, CalculatorI18n, CATEGORY_I18N_KEYS,
  CalcState, changeConvertCategory, changeConvertUnits, chipsFor, clearCalcHistory, convertOutput, copyText,
  currentProgValue, disabledKeysFor, findCategory, HistoryEntry, initialCalcState, keypadsFor, loadHistoryEntry,
  localeFor, pasteText, pressKey, ProgBase, restoreCalc, serializeCalc, setProgBase, setProgSigned,
  setProgWordSize, swapConvertUnits, switchProfile, toggleProgBit, toggleRpnMode, UNIT_I18N_KEYS, UnitCategoryId,
  WordSize,
} from '@okr/instruments-calculator-util';

type CalculatorStoreState = { calc: CalcState };

function readStorage(): string | null {
  try {
    return localStorage.getItem(CALC_STORAGE_KEY);
  } catch {
    return null;
  }
}

function writeStorage(value: string): void {
  try {
    localStorage.setItem(CALC_STORAGE_KEY, value);
  } catch {
    // storage blocked (private mode, site data off): settings simply stay in memory
  }
}

/**
 * Owns the calculator state. All arithmetic lives in the util reducer; this store only dispatches
 * keys, derives the view and persists settings/memory/history per device. Component-provided.
 */
export const CalculatorStore = signalStore(
  withState<CalculatorStoreState>({ calc: initialCalcState() }),
  withProps(() => ({
    i18nService: inject(I18nService),
    toastController: inject(ToastController),
  })),
  withProps((store) => ({
    i18n: store.i18nService.translateAll(CALCULATOR_I18N_KEYS) as CalculatorI18n,
    unitI18n: store.i18nService.translateAll(UNIT_I18N_KEYS),
    categoryI18n: store.i18nService.translateAll(CATEGORY_I18N_KEYS),
    locale: localeFor(store.i18nService.getActiveLang()),
  })),
  withComputed((store) => ({
    settings: computed(() => store.calc().settings),
    view: computed(() => calcView(store.calc(), store.locale)),
    chips: computed(() => chipsFor(store.calc())),
    keypads: computed(() => keypadsFor(store.calc(), store.locale)),
    disabledKeys: computed(() => disabledKeysFor(store.calc())),
    history: computed(() => store.calc().history),
    programmerValue: computed(() => currentProgValue(store.calc())),
    convertOutput: computed(() => convertOutput(store.calc(), store.locale)),
    convertUnits: computed(() => findCategory(store.calc().settings.convertCategory).units),
  })),
  withMethods((store) => {
    const update = (fn: (st: CalcState) => CalcState): void => patchState(store, { calc: fn(store.calc()) });
    return {
      press: (key: CalcKey): void => update(st => pressKey(st, key, store.locale)),
      setProfile: (profile: CalcProfile): void => update(st => switchProfile(st, profile, store.locale)),
      toggleRpn: (): void => update(st => toggleRpnMode(st, store.locale)),
      setBase: (base: ProgBase): void => update(st => setProgBase(st, base)),
      setWordSize: (wordSize: WordSize): void => update(st => setProgWordSize(st, wordSize)),
      setSigned: (signed: boolean): void => update(st => setProgSigned(st, signed)),
      toggleBit: (index: number): void => update(st => toggleProgBit(st, index)),
      setConvertCategory: (id: UnitCategoryId): void => update(st => changeConvertCategory(st, id)),
      setConvertUnits: (from: string, to: string): void => update(st => changeConvertUnits(st, from, to)),
      swapUnits: (): void => update(swapConvertUnits),
      pickHistory: (entry: HistoryEntry): void => update(st => loadHistoryEntry(st, entry, store.locale)),
      clearHistory: (): void => update(clearCalcHistory),
      paste: (text: string): void => update(st => pasteText(st, text, store.locale)),
      copy: async (): Promise<void> => {
        const text = copyText(store.calc(), store.locale);
        if (text) await copyToClipboardWithConfirmation(store.toastController, text);
      },
    };
  }),
  withHooks({
    onInit(store) {
      patchState(store, { calc: restoreCalc(readStorage()) });
      effect(() => writeStorage(serializeCalc(store.calc())));
    },
  }),
);

import { computed, effect, inject } from '@angular/core';
import { patchState, signalStore, withComputed, withHooks, withMethods, withProps, withState } from '@ngrx/signals';

import { I18nService } from '@okr/shared-i18n';
import { TranslatorService } from '@okr/instruments-translator-data-access';
import {
  DEFAULT_TRANSLATOR_SETTINGS, restoreTranslator, serializeTranslator, sortLanguages, swapLanguages,
  TRANSLATOR_I18N_KEYS, TRANSLATOR_MAX_TEXT, TRANSLATOR_STORAGE_KEY, TranslatorI18n, TranslatorLanguage, TranslatorSettings,
} from '@okr/instruments-translator-util';

/** Pause after the last keystroke before a translation is requested. */
const DEBOUNCE_MS = 600;

export type TranslatorStatus = 'idle' | 'loading' | 'done' | 'error' | 'busy';

interface TranslatorState extends TranslatorSettings {
  text: string;
  translatedText: string;
  /** Detected source language of the shown translation (only with «Sprache erkennen»). */
  detectedSource: string | null;
  attribution: string;
  status: TranslatorStatus;
  languages: TranslatorLanguage[];
  languagesFailed: boolean;
}

function readStorage(): string | null {
  try {
    return localStorage.getItem(TRANSLATOR_STORAGE_KEY);
  } catch {
    return null;
  }
}

function writeStorage(value: string): void {
  try {
    localStorage.setItem(TRANSLATOR_STORAGE_KEY, value);
  } catch {
    // storage blocked (private mode, site data off): the pair simply stays in memory
  }
}

function isBusy(err: unknown): boolean {
  const code = (err as { code?: unknown } | null)?.code;
  return code === 'functions/resource-exhausted';
}

/**
 * The Übersetzer's state (idea 2.126): the language pair (remembered per device), the language list
 * in the UI language, the input text and its translation. A translation is requested DEBOUNCE_MS after
 * the last change; an answer that arrives after a newer request was started is dropped.
 * Component-provided.
 */
export const TranslatorStore = signalStore(
  withState<TranslatorState>({
    ...DEFAULT_TRANSLATOR_SETTINGS,
    text: '', translatedText: '', detectedSource: null, attribution: '', status: 'idle',
    languages: [], languagesFailed: false,
  }),
  withProps(() => ({
    i18nService: inject(I18nService),
    translatorService: inject(TranslatorService),
    timer: { id: undefined as ReturnType<typeof setTimeout> | undefined, generation: 0 },
  })),
  withProps((store) => ({
    i18n: store.i18nService.translateAll(TRANSLATOR_I18N_KEYS) as TranslatorI18n,
  })),
  withComputed((state) => ({
    tooLong: computed(() => state.text().trim().length > TRANSLATOR_MAX_TEXT),
    detectedName: computed(() => {
      const code = state.detectedSource();
      if (!code) return '';
      return state.languages().find(l => l.code === code)?.name ?? code;
    }),
  })),
  withMethods((store) => {
    const run = async (generation: number): Promise<void> => {
      const text = store.text().trim();
      try {
        const res = await store.translatorService.translate(text, store.source(), store.target());
        if (generation !== store.timer.generation) return;
        patchState(store, {
          translatedText: res.translatedText, detectedSource: res.detectedSource,
          attribution: res.attribution.provider, status: 'done',
        });
      } catch (err) {
        if (generation !== store.timer.generation) return;
        patchState(store, { status: isBusy(err) ? 'busy' : 'error' });
      }
    };

    /** Restarts the debounce; empty or too long text clears the result instead. */
    const schedule = (delayMs = DEBOUNCE_MS): void => {
      clearTimeout(store.timer.id);
      const generation = ++store.timer.generation;
      const text = store.text().trim();
      if (text.length === 0 || text.length > TRANSLATOR_MAX_TEXT) {
        patchState(store, { translatedText: '', detectedSource: null, status: 'idle' });
        return;
      }
      patchState(store, { status: 'loading' });
      store.timer.id = setTimeout(() => run(generation), delayMs);
    };

    return {
      setText: (text: string): void => {
        patchState(store, { text });
        schedule();
      },
      setSource: (source: string): void => {
        if (source === store.source()) return;
        patchState(store, { source });
        schedule(0);
      },
      setTarget: (target: string): void => {
        if (target === store.target()) return;
        patchState(store, { target });
        schedule(0);
      },
      /** Swaps the pair; the translation becomes the new input, as in other translators. */
      swap: (): void => {
        const pair = swapLanguages({ source: store.source(), target: store.target(), torch: store.torch() }, store.detectedSource());
        if (pair.source === store.source() && pair.target === store.target()) return;
        const text = store.translatedText() || store.text();
        patchState(store, { ...pair, text });
        schedule(0);
      },
      setTorch: (torch: boolean): void => patchState(store, { torch }),
      retry: (): void => schedule(0),
      loadLanguages: async (): Promise<void> => {
        const display = store.i18nService.getActiveLang();
        try {
          const res = await store.translatorService.languages(display);
          patchState(store, { languages: sortLanguages(res.languages, display), languagesFailed: false });
        } catch {
          patchState(store, { languagesFailed: true });
        }
      },
      cancel: (): void => {
        clearTimeout(store.timer.id);
        store.timer.generation++;
      },
    };
  }),
  withHooks({
    onInit(store) {
      patchState(store, restoreTranslator(readStorage()));
      effect(() => writeStorage(serializeTranslator({ source: store.source(), target: store.target(), torch: store.torch() })));
      store.loadLanguages();
    },
    onDestroy(store) {
      store.cancel();
    },
  }),
);


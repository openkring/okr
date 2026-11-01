import { Signal } from '@angular/core';

import { PFX } from './scope';

export const TRANSLATOR_I18N_KEYS = {
  title:           PFX + 'title',
  source:          PFX + 'source',
  target:          PFX + 'target',
  auto:            PFX + 'auto',
  detected:        PFX + 'detected',
  swap:            PFX + 'swap',
  input:           PFX + 'input.placeholder',
  clear:           PFX + 'input.clear',
  tooLong:         PFX + 'input.tooLong',
  mic_start:       PFX + 'mic.start',
  mic_stop:        PFX + 'mic.stop',
  copy:            PFX + 'copy',
  copied:          PFX + 'copied',
  copyFailed:      PFX + 'copyFailed',
  speak:           PFX + 'speak.start',
  speak_stop:      PFX + 'speak.stop',
  attribution:     PFX + 'attribution',
  privacy:         PFX + 'privacy',
  error_failed:    PFX + 'error.failed',
  error_busy:      PFX + 'error.busy',
  error_languages: PFX + 'error.languages',
  retry:           PFX + 'retry',
  live_open:       PFX + 'live.open',
  live_close:      PFX + 'live.close',
  live_loading:    PFX + 'live.loading',
  live_noModel:    PFX + 'live.noModel',
  live_modelFailed: PFX + 'live.modelFailed',
  live_hint:       PFX + 'live.hint',
  live_privacy:    PFX + 'live.privacy',
} satisfies Record<string, string>;

export type TranslatorI18n = { [K in keyof typeof TRANSLATOR_I18N_KEYS]: Signal<string> };

import { Signal } from '@angular/core';

import { PFX } from './scope';

export const LUPE_I18N_KEYS = {
  title:            PFX + 'title',
  torch_on:         PFX + 'torch.on',
  torch_off:        PFX + 'torch.off',
  zoom:             PFX + 'zoom.label',
  zoom_in:          PFX + 'zoom.in',
  zoom_out:         PFX + 'zoom.out',
  error_denied:     PFX + 'error.denied',
  error_noCamera:   PFX + 'error.noCamera',
  error_unsupported: PFX + 'error.unsupported',
  error_failed:     PFX + 'error.failed',
  retry:            PFX + 'retry',
} satisfies Record<string, string>;

export type LupeI18n = { [K in keyof typeof LUPE_I18N_KEYS]: Signal<string> };

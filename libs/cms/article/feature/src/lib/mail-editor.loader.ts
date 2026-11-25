import type { Type } from '@angular/core';

import type { MailEditorHost } from './mail-editor-host';

/**
 * The editor of a Versand mail, for `createComponent` in the composer (spec 1.176 §10). `bulk-email.ts` hands it to the composer as the
 * input `mailEditor`: the host, the surface, the canvas and ProseMirror stay in a chunk of their own, loaded when a Versand opens its editor.
 */
export async function loadMailEditor(): Promise<Type<MailEditorHost>> {
  return (await import('./mail-editor-host')).MailEditorHost;
}

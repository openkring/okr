import { Injectable } from '@angular/core';

import { ArticleBlocksGate } from './article-blocks-gate.service';

/**
 * The first version in which every app can read the new look choices of a people section (spec 1.181, release A = v7.64.0).
 * undefined = not released yet, the gate is closed. The gate opens once `minVersion` reaches it (release B).
 */
export const PEOPLE_EDITOR_MIN_VERSION: string | undefined = '7.64.0';

/**
 * Whether the people block editor may be opened: the same gate as for the article editor (`app-version.minVersion`, trial mode in
 * development builds), with its own version. `undefined` is closed, never open (the base class answers false without reading).
 */
@Injectable({ providedIn: 'root' })
export class PeopleEditorGate extends ArticleBlocksGate {
  protected override readonly needed: string | undefined = PEOPLE_EDITOR_MIN_VERSION;
}

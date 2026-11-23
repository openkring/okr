import { Injectable, inject, isDevMode, signal, type Signal } from '@angular/core';

import { FirestoreService } from '@okr/shared-data-access';
import { AppVersionCollection, compareAppVersions } from '@okr/shared-util-angular';

/** The first version in which every app can read blocks (1.173). undefined = not released yet, the gate is closed. Set by the owner's release step (design §11). */
export const ARTICLE_BLOCKS_MIN_VERSION: string | undefined = undefined;

/** localStorage key and value of the trial mode (development builds only). */
const TRIAL_KEY = 'okr.articleEditor';
const TRIAL_VALUE = 'trial';

const VERSION = /^\d+(\.\d+)*$/;

/** Whether `minVersion` (as read from `app-version`) is at least `needed`. Anything that is not a plain version number is closed. */
export function isGateOpen(needed: string | undefined, minVersion: unknown): boolean {
  if (!needed || !VERSION.test(needed)) return false;
  if (typeof minVersion !== 'string' || !VERSION.test(minVersion)) return false;
  return compareAppVersions(minVersion, needed) >= 0;
}

function isTrial(): boolean {
  if (!isDevMode()) return false;
  try {
    return localStorage.getItem(TRIAL_KEY) === TRIAL_VALUE;
  } catch {
    return false;   // blocked storage, or no browser
  }
}

/**
 * Whether articles may be written with blocks (spec 1.175 §11): only once no app that cannot read blocks is in use any more,
 * which the global `minVersion` guarantees. Every failure is a closed gate.
 */
@Injectable({ providedIn: 'root' })
export class ArticleBlocksGate {
  private readonly firestoreService = inject(FirestoreService);

  /**
   * Trial mode (development builds only): the gate is open and `ArticleSaveService` writes nothing. Fixed when the app starts,
   * so that an editor opened in trial mode can never save for real. Everything else that writes must ask for it itself.
   */
  public readonly trial: boolean = isTrial();

  private readonly _open = signal(this.trial);
  /** The answer of the last `load()`; closed before it. */
  public readonly open: Signal<boolean> = this._open.asReadonly();

  /** Overridden in the tests. */
  protected readonly needed: string | undefined = ARTICLE_BLOCKS_MIN_VERSION;
  private loading: Promise<boolean> | undefined;

  /** Reads `app-version` once per session while the gate is open, and again when it was closed or unreadable. Never rejects. */
  public load(): Promise<boolean> {
    if (this._open()) return Promise.resolve(true);
    if (this.needed === undefined) return Promise.resolve(false);   // nothing to compare with
    this.loading ??= this.read().finally(() => { this.loading = undefined; });
    return this.loading;
  }

  private async read(): Promise<boolean> {
    try {
      const document = await this.firestoreService.readObjectStrict<{ minVersion?: unknown }>(`${AppVersionCollection}/${AppVersionCollection}`);
      this._open.set(isGateOpen(this.needed, document?.minVersion));
    } catch (error) {
      console.warn('ArticleBlocksGate: app-version cannot be read, the gate stays closed', error);
    }
    return this._open();
  }
}

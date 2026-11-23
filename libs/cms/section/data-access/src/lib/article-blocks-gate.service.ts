import { Injectable, computed, inject, isDevMode, signal, type Signal } from '@angular/core';

import { FirestoreService } from '@okr/shared-data-access';
import { AppVersionCollection, compareAppVersions } from '@okr/shared-util-angular';

/** The first version in which every app can read blocks (1.173). undefined = not released yet, the gate is closed. Set by the owner's release step (design §11). */
export const ARTICLE_BLOCKS_MIN_VERSION: string | undefined = undefined;

/** How long `load()` keeps somebody waiting who wants to open an article. */
export const ARTICLE_GATE_TIMEOUT_MS = 3000;

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
 *
 * Two answers, which differ in trial mode only: `open` (the editor may be opened) and `mayWrite` (blocks may be stored). Code that
 * stores blocks itself uses `mayWrite` / `loadMayWrite()` only.
 */
@Injectable({ providedIn: 'root' })
export class ArticleBlocksGate {
  private readonly firestoreService = inject(FirestoreService);

  /**
   * Trial mode (development builds only): the editor opens, nothing may be written. Fixed when the app starts, so that an editor
   * opened in trial mode can never save for real. `ArticleSaveService` obeys it; everything else that writes
   * (for example an upload) must ask for it itself.
   */
  public readonly trial: boolean = isTrial();

  /** Whether `minVersion` was read and is high enough. */
  private readonly released = signal(false);
  /** The editor may be opened. False until `load()` has found the gate open; always true in trial mode. Says nothing about writing. */
  public readonly open: Signal<boolean> = computed(() => this.trial || this.released());
  /** Blocks may be stored. False until `load()` / `loadMayWrite()` has found the gate open; always false in trial mode. */
  public readonly mayWrite: Signal<boolean> = computed(() => !this.trial && this.released());

  /** Overridden in the tests. */
  protected readonly needed: string | undefined = ARTICLE_BLOCKS_MIN_VERSION;
  private loading: Promise<boolean> | undefined;

  /**
   * Whether the editor may be opened. Reads `app-version` once per session while the gate is open, and again when it was closed
   * or unreadable. Never rejects. Somebody waits for it: after ARTICLE_GATE_TIMEOUT_MS it answers with what is known; a later answer
   * counts for the next call.
   */
  public async load(): Promise<boolean> {
    if (this.trial) return true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const late = new Promise<void>((resolve) => { timer = setTimeout(resolve, ARTICLE_GATE_TIMEOUT_MS); });
    try {
      await Promise.race([this.loadReleased(), late]);
    } finally {
      clearTimeout(timer);
    }
    return this.open();
  }

  /** Whether blocks may be stored; the same reads as `load()`. Never rejects, and waits as long as the read takes. */
  public loadMayWrite(): Promise<boolean> {
    return this.trial ? Promise.resolve(false) : this.loadReleased();
  }

  private loadReleased(): Promise<boolean> {
    if (this.released()) return Promise.resolve(true);
    if (this.needed === undefined) return Promise.resolve(false);   // nothing to compare with
    this.loading ??= this.read().finally(() => { this.loading = undefined; });
    return this.loading;
  }

  private async read(): Promise<boolean> {
    try {
      const document = await this.firestoreService.readObjectStrict<{ minVersion?: unknown }>(`${AppVersionCollection}/${AppVersionCollection}`);
      this.released.set(isGateOpen(this.needed, document?.minVersion));
    } catch (error) {
      console.warn('ArticleBlocksGate: app-version cannot be read, the gate stays closed', error);
    }
    return this.released();
  }
}

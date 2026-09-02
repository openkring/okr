import { Injectable } from '@angular/core';

import type { ApplyPlanPreview } from '@okr/tenant-util';

import { getApp } from 'firebase/app';
import { getFunctions, httpsCallable } from 'firebase/functions';

/** Response of the `applyFeatureSelection` callable — spec 2026-08-01-feature-building-blocks-design.md §8. */
export interface ApplyFeatureSelectionResponse {
  enabled: string[];
  withheld: { id: string; reason: string }[];
  applied: string[];
  /** What the call did — or, with `dryRun`, what it would have done and did not. */
  preview: ApplyPlanPreview;
}

/**
 * The single client entry point for changing a tenant's feature selection. All writes
 * happen server-side (D-BB-9) — never write `enabledFeatures` or menu docs from here.
 *
 * Follows the repo's established callable-client convention (no `@angular/fire` wrapper
 * exists in this codebase — see e.g. `PersonService`/`ZefixService`): a plain `firebase/functions`
 * `httpsCallable` against the `europe-west6` region, held as a class field.
 */
@Injectable({ providedIn: 'root' })
export class FeatureSelectionService {
  private readonly functions = getFunctions(getApp(), 'europe-west6');

  /**
   * Applies the given block selection for a tenant. Errors are not caught here — this
   * is a critical, user-initiated write; the caller (feature layer) decides how to
   * surface a failure (mirrors `PersonService.mergeIntoTenant`, which does the same).
   *
   * `dryRun` plans the whole run server-side and writes nothing, returning the same
   * `preview` a real call returns. Use it to show an admin what a save will do before it
   * happens: the server reads `menuItems` UNSCOPED, so it is the only place that can tell a
   * document this tenant would newly inherit from one that must be created — a tenant-scoped
   * client query cannot, and would predict the wrong operation.
   *
   * `replayStructure` is OPT-IN and belongs to «Struktur übernehmen» alone. Leaving it out
   * — what an ordinary save does — means the callable may create and extend menu documents
   * but never overwrite the `url`/`action`/`roleNeeded` of one that already exists. Passing
   * `true` replays the catalogue over live values for every enabled block, which is exactly
   * what silently reverted hand-tuned permissions before it became a separate act.
   */
  public async apply(
    tenantId: string,
    blockIds: string[],
    options: { replayStructure?: boolean; dryRun?: boolean } = {},
  ): Promise<ApplyFeatureSelectionResponse> {
    const fn = httpsCallable<
      { tenantId: string; blockIds: string[]; replayStructure: boolean; dryRun: boolean },
      ApplyFeatureSelectionResponse
    >(this.functions, 'applyFeatureSelection');
    const result = await fn({
      tenantId, blockIds,
      replayStructure: options.replayStructure === true,
      dryRun: options.dryRun === true,
    });
    return result.data;
  }
}

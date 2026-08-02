import { Injectable } from '@angular/core';

import { getApp } from 'firebase/app';
import { getFunctions, httpsCallable } from 'firebase/functions';

/** Response of the `applyFeatureSelection` callable — spec 2026-08-01-feature-building-blocks-design.md §8. */
export interface ApplyFeatureSelectionResponse {
  enabled: string[];
  withheld: { id: string; reason: string }[];
  seeded: string[];
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
   */
  public async apply(tenantId: string, blockIds: string[]): Promise<ApplyFeatureSelectionResponse> {
    const fn = httpsCallable<{ tenantId: string; blockIds: string[] }, ApplyFeatureSelectionResponse>(
      this.functions, 'applyFeatureSelection');
    const result = await fn({ tenantId, blockIds });
    return result.data;
  }
}

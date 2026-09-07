import { Injectable } from '@angular/core';

import type { ApplyFeatureRequest, ApplyFeatureResponse, FeatureIntent, StructuralField } from '@okr/tenant-util';

import { getApp } from 'firebase/app';
import { getFunctions, httpsCallable } from 'firebase/functions';

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

  private async send(
    tenantId: string, intent: FeatureIntent, options: { dryRun?: boolean } = {},
  ): Promise<ApplyFeatureResponse> {
    const fn = httpsCallable<ApplyFeatureRequest, ApplyFeatureResponse>(
      this.functions, 'applyFeatureSelection');
    const result = await fn({ tenantId, intent, dryRun: options.dryRun === true });
    return result.data;
  }

  /**
   * Switch a block on and create exactly the menu rows in `menuKeys` (D-BB-14). A key left
   * out is not created now and is not created later either — the catalogue offers a block's
   * rows once, at this moment, and never re-asserts them.
   */
  public enableBlock(tenantId: string, blockId: string, menuKeys: string[], options: { dryRun?: boolean } = {}): Promise<ApplyFeatureResponse> {
    return this.send(tenantId, { verb: 'enableBlock', blockId, menuKeys }, options);
  }

  public disableBlock(tenantId: string, blockId: string, options: { dryRun?: boolean } = {}): Promise<ApplyFeatureResponse> {
    return this.send(tenantId, { verb: 'disableBlock', blockId }, options);
  }

  /** Attach rows of blocks that are ALREADY enabled — the «Ins Menü» action of the table. */
  public addMenuRows(tenantId: string, keys: string[], options: { dryRun?: boolean } = {}): Promise<ApplyFeatureResponse> {
    return this.send(tenantId, { verb: 'addMenuRows', keys }, options);
  }

  /** Write the catalogue's value into ONE field of ONE document. Refused if pinned. */
  public applyCatalogueValue(
    tenantId: string, docId: string, field: StructuralField, options: { dryRun?: boolean } = {},
  ): Promise<ApplyFeatureResponse> {
    return this.send(tenantId, { verb: 'applyCatalogueValue', docId, field }, options);
  }

  /** «Fixieren» — this value is a tenant decision; the catalogue stops writing the field. */
  public pinField(tenantId: string, docId: string, field: StructuralField, options: { dryRun?: boolean } = {}): Promise<ApplyFeatureResponse> {
    return this.send(tenantId, { verb: 'pinField', docId, field }, options);
  }

  /** «Lösen» — release the field back to the catalogue. */
  public unpinField(tenantId: string, docId: string, field: StructuralField, options: { dryRun?: boolean } = {}): Promise<ApplyFeatureResponse> {
    return this.send(tenantId, { verb: 'unpinField', docId, field }, options);
  }
}

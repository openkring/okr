import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { FirestoreService } from '@okr/shared-data-access';
import { AppConfig, AppConfigCollection, DiaryPeriod } from '@okr/shared-models';
import { I18nService } from "@okr/shared-i18n";

import { PFX } from "./scope";

@Injectable({
  providedIn: 'root'
})
export class AppConfigService {
  private readonly firestoreService = inject(FirestoreService);
  private readonly i18nService = inject(I18nService);

  // i18n
  protected readonly i18n = this.i18nService.translateAll({
    create_conf: PFX + 'appConfig.create.conf',
    create_error: PFX + 'appConfig.create.error',
    update_conf: PFX + 'appConfig.update.conf',
    delete_conf: PFX + 'appConfig.delete.conf',
  });

  /*-------------------------- CRUD operations --------------------------------*/
  /**
   * Create a new AppConfig in the database.
   * @param appConfig the application configuration to store in the database
   * @param key the document id of the AppConfig, if undefined a new random document id will be generated
   * @returns the document id of the newly created AppConfig or undefined if the operation failed
   */
  public async create(appConfig: AppConfig, key: string | undefined): Promise<string | undefined> {
    return this.firestoreService.createObject<AppConfig>(AppConfigCollection, key, appConfig, this.i18n.create_conf(), this.i18n.create_error());
  }

  /**
   * Lookup a AppConfig in the database and return it as an Observable.
   * @param key the document id of the AppConfig (= tenantId)
   * @returns an Observable of the AppConfig
   */
  public read(key: string | undefined): Observable<AppConfig | undefined> {
    return this.firestoreService.readObject<AppConfig>(AppConfigCollection, key);
  }

  /**
   * Update an AppConfig in the database with new values.
   * @param appConfig the AppConfig with the new values.
   * @param key the document id of the AppConfig, must be valid (in order to find it in the database)
   * @param message the confirmation message to show in a toast after successful update
   * @returns the document id of the updated AppConfig or undefined if the operation failed
   */
  public async update(appConfig: AppConfig, key: string): Promise<string | undefined> {
    return await this.firestoreService.updateObject<AppConfig>(AppConfigCollection, key, appConfig, false, this.i18n.update_conf());
  }

  /**
   * Write ONLY `hiddenMenuKeys` — the per-row menu opt-out (the fourth visibility gate).
   *
   * Deliberately a single-field `updateDoc` rather than {@link update}, which writes the whole
   * document back: the caller holds an `AppConfig` hydrated from a live stream, and writing all
   * of it would push whatever else that snapshot happens to carry. Here exactly one field moves.
   *
   * Client-writable on purpose. `firestore.rules` lets a privileged user of their OWN tenant
   * update `app-config` as long as `enabledFeatures` is untouched, because that field is the
   * billing boundary. `hiddenMenuKeys` is not: it can only hide rows of blocks the tenant has
   * already enabled, never enable anything. So this needs no callable and no functions deploy.
   *
   * @param tenantId the tenant whose config to patch — the doc id IS the tenantId
   * @param keys the complete next list; build it with `withHiddenKey` / `withoutHiddenKey`
   */
  public async setHiddenMenuKeys(tenantId: string, keys: string[]): Promise<string | undefined> {
    return await this.firestoreService.updateObject<Partial<AppConfig>>(
      AppConfigCollection, tenantId, { hiddenMenuKeys: keys }, false, this.i18n.update_conf());
  }

  /**
   * Patch the two task settings only (same single-field pattern as {@link setHiddenMenuKeys}).
   * Typed inline with `Pick<AppConfig, …>` rather than `@okr/task-util`'s `TaskSettings` — the
   * two are the same shape by construction, but `shared-data-access` must not import a
   * feature-domain util lib.
   *
   * @param tenantId the tenant whose config to patch — the doc id IS the tenantId
   * @param settings `{ taskArchiveDays, diaryTenantId }`
   */
  public async setTaskSettings(tenantId: string, settings: Pick<AppConfig, 'taskArchiveDays' | 'diaryTenantId'>): Promise<string | undefined> {
    return await this.firestoreService.updateObject<Partial<AppConfig>>(
      AppConfigCollection, tenantId, { ...settings }, false, this.i18n.update_conf());
  }

  /**
   * Patch the published travel period only (spec 1.77 D7); same single-field pattern as
   * {@link setTaskSettings}. Diary-transfer columns with empty bounds inherit this period.
   *
   * @param tenantId the diary tenant whose config to patch — the doc id IS the tenantId
   * @param period `{ travelFrom, travelTo }` as StoreDate strings, `''` = open bound
   */
  public async setTravelPeriod(tenantId: string, period: DiaryPeriod): Promise<string | undefined> {
    return await this.firestoreService.updateObject<Partial<AppConfig>>(
      AppConfigCollection, tenantId, { travelFrom: period.travelFrom, travelTo: period.travelTo }, false, this.i18n.update_conf());
  }

  /**
   * We are not actually deleting an AppConfig. We are just archiving it.
   * @param key the document id of the AppConfig
   * @returns a Promise that resolves when the operation is complete 
   */
  public async delete(key: string): Promise<void> {
    await this.firestoreService.deleteObject(AppConfigCollection, key, this.i18n.update_conf());
  }

  /*-------------------------- LIST / QUERY / FILTER --------------------------------*/

  /**
   * Every tenant's `AppConfig`, `okey` = tenant id (the document id — see the class comment on
   * why the tenant id is never a class FIELD). `addOkey: true` so a caller enumerating tenant ids
   * (e.g. the `diaryTenantId` select) has something to read; the return type is widened with
   * `& { okey: string }` rather than adding `okey` to the `AppConfig` class itself, which would
   * reintroduce exactly the duplicated-identity trap the class comment warns against. Nothing
   * consumed this list before, so widening it changes no existing caller.
   */
  public list(): Observable<(AppConfig & { okey: string })[]> {
    return this.firestoreService.listAllObjects<AppConfig & { okey: string }>(AppConfigCollection, true);
  }
}

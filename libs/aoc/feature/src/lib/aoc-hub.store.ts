import { computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { AlertController, ModalController, ToastController } from '@ionic/angular';
import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';
import { from, Observable, of } from 'rxjs';
import { StaticSuite } from 'vest';

import { ActivityService } from '@okr/activity-data-access';
import { FirestoreService } from '@okr/shared-data-access';
import { AppStore } from '@okr/shared-feature';
import { I18nService } from '@okr/shared-i18n';
import { ActivityCollection, ActivityModel, AddressCollection, AddressModel, OkrModel, CalEventCollection, CalEventModel, CalEventModelName, CategoryCollection, CommentCollection, CommentModel,
  DocumentCollection, DocumentModel, GroupCollection, LocationCollection, LocationModel, LogInfo, MembershipCollection, MembershipModel, MenuItemCollection,
  MenuItemModel, OrgCollection, OrgModel, OwnershipCollection, OwnershipModel, PageCollection, PageModel, PersonalRelCollection, PersonalRelModel, PersonCollection,
  PersonModel, ReservationCollection, ReservationModel, SessionCollection, SessionModel, TaskCollection, TransferCollection, UserCollection,
  WorkrelCollection, TaskModel, ResourceModel, ResourceCollection, TransferModel, UserModel, WorkrelModel, GroupModel, CategoryModel,
  CategoryListModel, DbQuery, ResponsibilityModel, ResponsibilityCollection } from '@okr/shared-models';
import { fill, getCategoryIndex, getFullName, getSystemQuery, hasRole, logToFindings, ReportFinding } from '@okr/shared-util-core';
import { resourceParams, showToast } from '@okr/shared-util-angular';
import { openReport } from '@okr/shared-ui';
import { FeatureStore } from '@okr/tenant-feature';
import { AOC_AREAS, AOC_HUB_I18N_KEYS, AocCardContext, formatValidationErrors, indexDiffs, IndexDiff, isOperationVisible, lastRunsByOperation } from '@okr/aoc-util';

import { addressValidations, getAddressIndex } from '@okr/subject-address-util';
import { commentValidations, getCommentIndex } from '@okr/comment-util';
import { calEventValidations, getCaleventIndex } from '@okr/calevent-util';
import { documentValidations, getDocumentIndex } from '@okr/content-document-util';
import { getLocationIndex, locationValidations } from '@okr/location-util';
import { getMembershipIndex, membershipValidations } from '@okr/relationship-membership-util';
import { getMenuIndex, menuItemValidations } from '@okr/cms-menu-util';
import { getOrgIndex, orgValidations } from '@okr/subject-org-util';
import { getOwnershipIndex, ownershipValidations } from '@okr/relationship-ownership-util';
import { getPageIndex, pageValidations } from '@okr/cms-page-util';
import { getPersonIndex, personValidations } from '@okr/subject-person-util';
import { getPersonalRelIndex, personalRelValidations } from '@okr/relationship-personal-rel-util';
import { getReservationIndex, reservationValidations } from '@okr/relationship-reservation-util';
import { getResourceIndex, resourceValidations } from '@okr/resource-util';
import { getTaskIndex, taskValidations } from '@okr/project-task-util';
import { getTransferIndex, transferValidations } from '@okr/relationship-transfer-util';
import { getWorkrelIndex, workrelValidations } from '@okr/relationship-workrel-util';
import { getUserIndex, userValidations } from '@okr/user-util';
import { categoryListValidations } from '@okr/category-util';
import { getGroupIndex, groupValidations } from '@okr/subject-group-util';
import { getResponsibilityIndex } from '@okr/relationship-responsibility-util';
import { getSessionIndex } from '@okr/session-util';

/** One collection's reindex preview: the docs whose index differs, and how to write them. */
interface ReindexPlan {
  collection: string;
  diffs: IndexDiff<OkrModel & { index?: string }>[];
}

/** The scope every hub run is logged under; `action` is the card's operation id. */
const AOC_SCOPE = 'aoc';

/**
 * The AOC hub (spec 1.101 phase 5): the cards' «last run» and the operations they dispatch.
 * Validierung, Suchindex and IBAN moved here from the deleted AocData / AocAdminOps pages with their
 * logic unchanged; only their output changed from the console / a result log to `openReport`.
 */
export const AocHubStore = signalStore(
  /** the operation id that is running; its card (and every other run button) is disabled meanwhile */
  withState({
    running: undefined as string | undefined,
  }),
  withProps(() => ({
    appStore: inject(AppStore),
    firestoreService: inject(FirestoreService),
    activityService: inject(ActivityService),
    featureStore: inject(FeatureStore),
    modalController: inject(ModalController),
    alertController: inject(AlertController),
    toastController: inject(ToastController),
    i18nService: inject(I18nService),
  })),
  withProps(store => ({
    i18n: store.i18nService.translateAll(AOC_HUB_I18N_KEYS),
    /** each card's label and effect, keyed `<cardId>.label` / `<cardId>.effect` */
    cardI18n: store.i18nService.translateAll(Object.fromEntries(
      AOC_AREAS.flatMap(c => [[c.id + '.label', c.labelKey], [c.id + '.effect', c.effectKey]])) as Record<string, string>),

    /**
     * All `scope: 'aoc'` activities of the tenant in ONE one-shot read (no live listener), reduced
     * client-side to the newest per operation id and reloaded after each run. Equality-only (no
     * orderBy), so the live `tenants` + `scope` composite index serves it — no new index. A
     * "newest N" limit would need `tenants` + `scope` + `timestamp DESC`, which is not live.
     */
    lastRunsResource: rxResource({
      params: resourceParams(() => ({ tenantId: store.appStore.tenantId() })),
      stream: ({ params }): Observable<ActivityModel[]> => {
        if (!params.tenantId) return of([]);
        const query: DbQuery[] = [
          { key: 'tenants', operator: 'array-contains', value: params.tenantId },
          { key: 'scope', operator: '==', value: AOC_SCOPE },
        ];
        return from(store.firestoreService.getDataOnce<ActivityModel>(ActivityCollection, query, 'none'));
      },
    }),
  })),

  withComputed(store => ({
    currentUser: computed(() => store.appStore.currentUser()),
    tenantId: computed(() => store.appStore.tenantId()),
    lastRuns: computed(() => lastRunsByOperation(store.lastRunsResource.value() ?? [])),
    /** what decides which cards (and so which operations) this user gets */
    cardContext: computed((): AocCardContext => {
      const user = store.appStore.currentUser();
      return {
        tenantId: store.appStore.tenantId(),
        isEnabled: store.featureStore.isEnabled(),
        hasRole: role => hasRole(role, user),
      };
    }),
  })),

  withMethods(store => {
    const logRun = async (operationId: string, payload: string): Promise<void> => {
      // a failed log write must never block the result report or toast of a run that succeeded
      try {
        await store.activityService.log(AOC_SCOPE, operationId, store.currentUser(), payload);
        store.lastRunsResource.reload();
      } catch (e) {
        console.warn(`AocHubStore: could not log the run of ${operationId}`, e);
      }
    };

    /** The picker label of a model type; the two spellings of the personal relation share one key. */
    const typeLabel = (type: string): string => {
      const key = `type_${type === 'personal_rel' ? 'personalRel' : type}` as keyof typeof store.i18n;
      return store.i18n[key]?.() ?? type;
    };

    /** Asks which data to work on: a radio list of the types the operation supports. */
    const pickType = async (types: string[]): Promise<string | undefined> => {
      const alert = await store.alertController.create({
        header: store.i18n.pick_type(),
        inputs: types.map(t => ({ type: 'radio' as const, label: typeLabel(t), value: t })),
        buttons: [
          { text: store.i18n.cancel(), role: 'cancel' },
          { text: store.i18n.ok(), role: 'confirm' },
        ],
      });
      await alert.present();
      const { data, role } = await alert.onDidDismiss();
      if (role !== 'confirm' || !data) return undefined;
      // a radio group hands back the value itself, not a {values} map
      const type: string = typeof data === 'string' ? data : (data.values ?? '');
      return type || undefined;
    };

    /**
     * Validate models of a given type using a vest test suite.
     * This checks each document of a given collection in the database for correctness.
     * @param tenants validates the models to have at least one of these tenants
     * @param tags validates the models to have only these tags
     */
    const executeValidation = async <T>(collection: string, suite: StaticSuite, tenants: string, tags: string, orderBy = 'name'): Promise<LogInfo[]> => {
      const dbQuery = getSystemQuery(store.appStore.tenantId());
      const data = await store.appStore.firestoreService.getDataOnce<T>(collection, dbQuery, orderBy, 'asc');
      const log: LogInfo[] = [];
      for (const model of data) {
        const okey = (model as { okey: string }).okey;
        const validationResult = suite(model, tenants, tags);
        if (validationResult.hasErrors()) {
          log.push({ id: okey, name: `${collection}/${okey}`, message: formatValidationErrors(validationResult.getErrors()) });
        }
      }
      return log;
    };

    /** The validations per model type (the former AocDataStore.validateModels switch). */
    const validations = (): Record<string, () => Promise<LogInfo[]>> => {
      const tenants = store.appStore.env.tenantId;
      const tags = (t: string) => store.appStore.getTags(t);
      return {
        address: () => executeValidation<AddressModel>(AddressCollection, addressValidations, tenants, tags('address'), 'parentKey'),
        comment: () => executeValidation<CommentModel>(CommentCollection, commentValidations, tenants, tags('comment'), 'creationDateTime'),
        document: () => executeValidation<DocumentModel>(DocumentCollection, documentValidations, tenants, tags('document'), 'title'),
        calevent: () => executeValidation<CalEventModel>(CalEventCollection, calEventValidations, tenants, tags(CalEventModelName), 'startDate'),
        location: () => executeValidation<LocationModel>(LocationCollection, locationValidations, tenants, tags('location'), 'name'),
        membership: () => executeValidation<MembershipModel>(MembershipCollection, membershipValidations, tenants, tags('membership'), 'memberName2'),
        menuitem: () => executeValidation<MenuItemModel>(MenuItemCollection, menuItemValidations, tenants, tags('menuitem')),
        org: () => executeValidation<OrgModel>(OrgCollection, orgValidations, tenants, tags('org'), 'name'),
        ownership: () => executeValidation<OwnershipModel>(OwnershipCollection, ownershipValidations, tenants, tags('ownership')),
        page: () => executeValidation<PageModel>(PageCollection, pageValidations, tenants, tags('page')),
        person: () => executeValidation<PersonModel>(PersonCollection, personValidations, tenants, tags('person'), 'lastName'),
        personal_rel: () => executeValidation<PersonalRelModel>(PersonalRelCollection, personalRelValidations, tenants, tags('personal_rel')),
        reservation: () => executeValidation<ReservationModel>(ReservationCollection, reservationValidations, tenants, tags('reservation')),
        resource: () => executeValidation<ResourceModel>(ResourceCollection, resourceValidations, tenants, tags('resource')),
        task: () => executeValidation<TaskModel>(TaskCollection, taskValidations, tenants, tags('task'), 'okey'),
        transfer: () => executeValidation<TransferModel>(TransferCollection, transferValidations, tenants, tags('transfer'), 'dateOfTransfer'),
        user: () => executeValidation<UserModel>(UserCollection, userValidations, tenants, tags('user'), 'loginEmail'),
        workrel: () => executeValidation<WorkrelModel>(WorkrelCollection, workrelValidations, tenants, tags('workrel'), 'okey'),
        category: () => executeValidation<CategoryModel>(CategoryCollection, categoryListValidations, tenants, tags('category')),
        group: () => executeValidation<GroupModel>(GroupCollection, groupValidations, tenants, tags('group')),
        // account, avatar, bill, competitionLevel, expense, invoice, invoicePosition, section, trip:
        // not yet implemented (unchanged)
      };
    };

    /** The display name behind an address `parentKey` (`person.<okey>` / `org.<okey>`). */
    const getOwnerName = (parentKey: string): string => {
      const [modelType, key] = (parentKey ?? '').split('.');
      if (modelType === 'person') {
        const person = store.appStore.getPerson(key) as PersonModel | undefined;
        return person ? getFullName(person.firstName, person.lastName) : '';
      }
      if (modelType === 'org') {
        return (store.appStore.getOrg(key) as OrgModel | undefined)?.name ?? '';
      }
      return '';
    };

    /**
     * The docs of a collection whose index differs from the generated one. Writes nothing.
     * @param includeArchived reindex soft-deleted documents too. Needed wherever a list can
     *   surface archived documents (the admin address list's archived toggle) — otherwise they
     *   keep a stale index forever and silently drop out of every search.
     */
    const planIndex = async <T extends OkrModel>(collection: string, generateIndexFn: (model: T) => string, orderBy = 'none', includeArchived = false): Promise<ReindexPlan> => {
      const dbQuery: DbQuery[] = includeArchived
        ? [{ key: 'tenants', operator: 'array-contains', value: store.appStore.tenantId() }]
        : getSystemQuery(store.appStore.tenantId());
      const data = await store.appStore.firestoreService.getDataOnce<T>(collection, dbQuery, orderBy, 'asc');
      const diffs = indexDiffs(data as (T & { index?: string })[], generateIndexFn);
      return { collection, diffs: diffs as ReindexPlan['diffs'] };
    };

    /** The index generators per model type (the former AocDataStore.createIndexesOnCollection switch). */
    const indexers = (): Record<string, () => Promise<ReindexPlan>> => ({
      // resolve the owner name here rather than waiting for onAddressChange to
      // stamp it — a backfill run should leave every index complete in one pass
      address: () => planIndex<AddressModel>(AddressCollection, (a) => getAddressIndex(a, getOwnerName(a.parentKey)), 'parentKey', true),
      comment: () => planIndex<CommentModel>(CommentCollection, getCommentIndex),
      document: () => planIndex<DocumentModel>(DocumentCollection, getDocumentIndex),
      calevent: () => planIndex<CalEventModel>(CalEventCollection, getCaleventIndex),
      location: () => planIndex<LocationModel>(LocationCollection, getLocationIndex),
      membership: () => planIndex<MembershipModel>(MembershipCollection, getMembershipIndex),
      menuitem: () => planIndex<MenuItemModel>(MenuItemCollection, getMenuIndex),
      org: () => planIndex<OrgModel>(OrgCollection, getOrgIndex, 'name'),
      ownership: () => planIndex<OwnershipModel>(OwnershipCollection, getOwnershipIndex),
      page: () => planIndex<PageModel>(PageCollection, getPageIndex),
      person: () => planIndex<PersonModel>(PersonCollection, getPersonIndex, 'lastName'),
      personalRel: () => planIndex<PersonalRelModel>(PersonalRelCollection, getPersonalRelIndex),
      reservation: () => planIndex<ReservationModel>(ReservationCollection, getReservationIndex),
      resource: () => planIndex<ResourceModel>(ResourceCollection, getResourceIndex),
      task: () => planIndex<TaskModel>(TaskCollection, getTaskIndex),
      transfer: () => planIndex<TransferModel>(TransferCollection, getTransferIndex),
      user: () => planIndex<UserModel>(UserCollection, getUserIndex, 'loginEmail'),
      workrel: () => planIndex<WorkrelModel>(WorkrelCollection, getWorkrelIndex),
      category: () => planIndex<CategoryListModel>(CategoryCollection, getCategoryIndex),
      group: () => planIndex<GroupModel>(GroupCollection, getGroupIndex),
      responsibility: () => planIndex<ResponsibilityModel>(ResponsibilityCollection, getResponsibilityIndex),
      session: () => planIndex<SessionModel>(SessionCollection, getSessionIndex, 'startedAt'),
      // account, avatar, bill, competitionLevel, expense, invoice, invoicePosition, section, trip:
      // not yet implemented (unchanged)
    });

    const fail = async (e: unknown): Promise<void> => {
      await showToast(store.toastController, `${store.i18n.error()}: ${(e as Error)?.message ?? e}`);
    };

    return {
      /**
       * Dispatches a card's operation id — only when that card is visible to this user (the client
       * gate; rules and callables still decide) and no other run is in flight.
       */
      async run(operationId: string): Promise<void> {
        if (store.running()) return;
        if (!isOperationVisible(AOC_AREAS, operationId, store.cardContext())) return;
        patchState(store, { running: operationId });
        try {
          switch (operationId) {
            case 'validate': return await this.validate();
            case 'reindex': return await this.reindex();
            case 'iban': return await this.listIban();
            default:
              console.warn(`AocHubStore.run: unknown operation ${operationId}`);
          }
        } finally {
          patchState(store, { running: undefined });
        }
      },

      /** Daten-Validierung: the Vest suites of one model type, findings in a check report. */
      async validate(): Promise<void> {
        const table = validations();
        const type = await pickType(Object.keys(table));
        if (!type) return;
        let log: LogInfo[];
        try {
          log = await table[type]();
        } catch (e) {
          await fail(e);
          return;
        }
        const label = typeLabel(type);
        await logRun('validate', `${type}: ${log.length}`);
        await openReport(store.modalController, {
          title: store.i18n.card_validate_label(),
          kind: 'check',
          explanation: fill(store.i18n.validate_explanation(), { type: label }),
          findings: logToFindings(log),
          ranAt: new Date(),
        });
      },

      /** Suchindex neu aufbauen: preview the docs whose index differs, then rewrite them on «apply». */
      async reindex(): Promise<void> {
        const table = indexers();
        const type = await pickType(Object.keys(table));
        if (!type) return;
        let plan: ReindexPlan;
        try {
          plan = await table[type]();
        } catch (e) {
          await fail(e);
          return;
        }
        const label = typeLabel(type);
        const count = plan.diffs.length;
        const findings: ReportFinding[] = plan.diffs.map(d => ({
          id: d.model.okey,
          title: `${plan.collection}/${d.model.okey}`,
          detail: `${store.i18n.reindex_old()}: ${d.oldIndex}\n${store.i18n.reindex_new()}: ${d.newIndex}`,
        }));
        // nothing to rewrite: the preview is the whole run
        if (count === 0) await logRun('reindex', `${type}: 0`);
        const result = await openReport(store.modalController, {
          title: store.i18n.card_reindex_label(),
          kind: 'check',
          explanation: fill(store.i18n.reindex_explanation(), { count, type: label }),
          findings,
          ranAt: new Date(),
          applyLabel: count > 0 ? store.i18n.reindex_apply() : undefined,
        });
        if (result?.kind !== 'apply') return;
        let written = 0;
        let failed = 0;
        for (const diff of plan.diffs) {
          // ONLY the index: re-sending the preview-time snapshot would revert any edit made while
          // the preview was open. updateObjectStrict is silent and rejects on a failed write, so
          // the failures are counted here and reported in ONE toast — not one toast per document.
          try {
            await store.firestoreService.updateObjectStrict(plan.collection, diff.model.okey, { index: diff.newIndex });
            written++;
          } catch (e) {
            failed++;
            console.error(`AocHubStore.reindex: ${plan.collection}/${diff.model.okey}`, e);
          }
        }
        await logRun('reindex', `${type}: ${written}/${count}`);
        await showToast(store.toastController, failed > 0
          ? fill(store.i18n.reindex_partial(), { count: written, failed })
          : fill(store.i18n.reindex_done(), { count: written }));
      },

      /**
       * IBAN-Bestand: the tenant's bank-account addresses with their owner, as a report.
       * Admin-only screen; the IBANs are shown, never copied into the activity log.
       */
      async listIban(): Promise<void> {
        const query = getSystemQuery(store.appStore.env.tenantId);
        query.push({ key: 'addressChannel', operator: '==', value: 'bankaccount' });
        let addresses: AddressModel[];
        try {
          addresses = await store.firestoreService.getDataOnce<AddressModel>(AddressCollection, query, 'none');
        } catch (e) {
          await fail(e);
          return;
        }
        const findings: ReportFinding[] = addresses.map(address => ({
          id: address.okey,
          title: getOwnerName(address.parentKey) || store.i18n.iban_no_owner(),
          detail: address.iban,
        }));
        await logRun('iban', `${findings.length}`);
        await openReport(store.modalController, {
          title: store.i18n.card_iban_label(),
          kind: 'report',
          explanation: store.i18n.iban_explanation(),
          findings,
          ranAt: new Date(),
        });
      },
    };
  })
);

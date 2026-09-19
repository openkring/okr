import { computed, inject } from '@angular/core';
import { ModalController, ToastController } from '@ionic/angular/standalone';
import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';
import { getApp } from 'firebase/app';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { firstValueFrom } from 'rxjs';

import { FirestoreService } from '@okr/shared-data-access';
import { AppStore, OrgSelectModal, PersonSelectModal, PersonSelectResult, ResourceSelectModal } from '@okr/shared-feature';
import { I18nService } from '@okr/shared-i18n';
import {
  AddressCollection, AddressModel, AllocationDirection, allocationSubjectKey, AllocationSubjectType,
  AppConfigCollection, AvatarCollection, AvatarInfo, AvatarModel, LogInfo, logMessage, OrgModel,
  PersonModel, ResourceModel,
} from '@okr/shared-models';
import { error } from '@okr/shared-util-angular';
import { getSystemQuery, isPerson, SYSTEM_TENANT } from '@okr/shared-util-core';

import {
  ALLOCATION_SUBJECTS, AllocationTile, AOC_I18N_KEYS, buildEmailOptions, eligibleAddresses,
  groupAddressesForConsent, isDropAllowed, splitTenants, TenantConfigMeta,
} from '@okr/aoc-util';

import { AllocationConfirmResult, TenantAllocationConfirmModal } from './tenant-allocation-confirm.modal';

/**
 * The record being allocated, flattened to what every card needs: a key, something to show,
 * and the `tenants[]` the two columns are drawn from. Keeping the full model out of the state
 * is what lets one store serve persons, orgs and resources without a union type in every read.
 */
export interface AllocationSubject {
  readonly okey: string;
  readonly label: string;
  readonly tenants: string[];
  readonly avatar: AvatarInfo;
}

export type AocTenantAllocationState = {
  /** Which card this store instance belongs to — set once by the card component. */
  modelType: AllocationSubjectType;
  subject: AllocationSubject | undefined;
  addresses: AddressModel[];
  hasAvatar: boolean;
  /** The `tenants[]` of `avatars/<prefix>.<okey>` — decides whether the avatar checkbox has
   * anything left to do for a given target. */
  avatarTenants: string[];
  tenantConfigs: Record<string, TenantConfigMeta>;
  log: LogInfo[];
  logTitle: string;
};

const initialState: AocTenantAllocationState = {
  modelType: 'person',
  subject: undefined,
  addresses: [],
  hasAvatar: false,
  avatarTenants: [],
  tenantConfigs: {},
  log: [],
  logTitle: '',
};

/** The response shape of the `allocateTenant` Cloud Function. */
interface AllocateTenantResponse {
  changed: Record<string, number>;
  rejected: { okey: string; reason: string }[];
  logKey: string;
  account: { created: boolean; loginEmail?: string; reason?: string };
}

/**
 * One instance per allocation card (spec 1.47, D-TA-7). The card provides it, so the three
 * cards hold three independent selections and three independent result logs.
 */
export const AocTenantAllocationStore = signalStore(
  withState(initialState),
  withProps(() => ({
    appStore: inject(AppStore),
    firestoreService: inject(FirestoreService),
    modalController: inject(ModalController),
    toastController: inject(ToastController),
    i18nService: inject(I18nService),
  })),
  withProps(store => ({
    i18n: store.i18nService.translateAll(AOC_I18N_KEYS),
  })),
  withComputed(store => ({
    /** What this model type does and does not support — addresses, an account offer. */
    meta: computed(() => ALLOCATION_SUBJECTS[store.modelType()]),
    /** Left and right column, derived from the subject and the app-config docs. */
    lists: computed(() => {
      const subject = store.subject();
      const configs = new Map(Object.entries(store.tenantConfigs()));
      return splitTenants(subject?.tenants ?? [], [...configs.keys()], store.appStore.env.tenantId, configs);
    }),
  })),
  withMethods(store => ({
    /** Which card this is. Called once, from the card component's constructor. */
    init(modelType: AllocationSubjectType): void {
      patchState(store, { modelType });
    },

    /**
     * The tenant list is the same for all three cards, so the page reads `app-config` once and
     * hands the result down rather than every card re-reading it.
     */
    setTenantConfigs(configs: Record<string, TenantConfigMeta>): void {
      patchState(store, { tenantConfigs: configs });
    },

    async loadAddresses(okey: string): Promise<void> {
      if (!ALLOCATION_SUBJECTS[store.modelType()].hasAddresses) {
        patchState(store, { addresses: [] });
        return;
      }
      // Same 'none' rule as in the page's config load — AddressModel has no `name` field, and
      // getDataOnce defaults to orderBy('name'), which silently excludes every document that
      // lacks the field. And the query is tenant-scoped via getSystemQuery: the raw vault rule
      // is tenant-scoped too, so an unscoped query would just be denied, and getDataOnce
      // swallows the denial and returns [] — which reads as "this record has no addresses".
      const query = getSystemQuery(store.appStore.env.tenantId);
      query.push({ key: 'parentKey', operator: '==', value: allocationSubjectKey(store.modelType(), okey) });
      const addresses = await store.firestoreService.getDataOnce<AddressModel>(AddressCollection, query, 'none');
      if (addresses.length === 0) {
        // getDataOnce swallows a permission denial into [], so an empty address list must not
        // read as a confident "this record has no addresses".
        const message = 'Zu diesem Datensatz wurden keine Adressen gefunden. Das kann auch bedeuten, dass der Zugriff verweigert wurde.';
        patchState(store, { logTitle: message, log: logMessage([...store.log()], message) });
      }
      patchState(store, { addresses: addresses.filter(a => !a.isArchived) });
    },

    /**
     * Whether the bare `avatars/<prefix>.<okey>` document exists — the only avatar doc the
     * target tenant of an allocation can ever read (see `allocate-tenant.ts`). A direct
     * point read by id, not a query, so the `getDataOnce` orderBy('name') pitfall does not
     * apply here.
     */
    async loadAvatar(okey: string): Promise<void> {
      const avatar = await firstValueFrom(
        store.firestoreService.readModel<AvatarModel>(AvatarCollection, allocationSubjectKey(store.modelType(), okey)),
      );
      patchState(store, { hasAvatar: !!avatar, avatarTenants: avatar?.tenants ?? [] });
    },

    clear(): void {
      patchState(store, {
        subject: undefined, addresses: [], hasAvatar: false, avatarTenants: [], log: [], logTitle: '',
      });
    },
  })),
  withMethods(store => ({
    /**
     * Open this card's select modal and load what hangs off the chosen record.
     *
     * The three modals have three different result shapes — `PersonSelectModal` wraps its
     * answer (a person can also be entered ad hoc, which is not a record that can be
     * allocated), the other two return the model — so the branch is here and nowhere else.
     */
    async select(): Promise<void> {
      const currentUser = store.appStore.currentUser();
      const modelType = store.modelType();
      const component = modelType === 'person' ? PersonSelectModal
        : modelType === 'org' ? OrgSelectModal
        : ResourceSelectModal;
      const modal = await store.modalController.create({
        component,
        cssClass: 'list-modal',
        componentProps: { selectedTag: '', currentUser },
      });
      modal.present();
      const { data, role } = await modal.onWillDismiss<PersonSelectResult | OrgModel | ResourceModel>();
      if (role !== 'confirm' || !data) return;

      let subject: AllocationSubject | undefined;
      if (modelType === 'person') {
        const result = data as PersonSelectResult;
        // An ad-hoc person exists only in the dialog that made it — there is no document to
        // hand to another tenant, so only a predefined one can be allocated.
        if (result.kind !== 'predefined' || !isPerson(result.person, store.appStore.env.tenantId)) return;
        const p = result.person as PersonModel;
        subject = {
          okey: p.okey,
          label: `${p.firstName} ${p.lastName}`.trim(),
          tenants: p.tenants,
          avatar: { key: p.okey, name1: p.firstName, name2: p.lastName, label: '', modelType: 'person', type: '', subType: '' } as AvatarInfo,
        };
      } else {
        const m = data as OrgModel | ResourceModel;
        subject = {
          okey: m.okey,
          label: m.name,
          tenants: m.tenants,
          avatar: { key: m.okey, name1: m.name, name2: '', label: '', modelType, type: m.type ?? '', subType: '' } as AvatarInfo,
        };
      }

      patchState(store, { subject });
      await store.loadAddresses(subject.okey);
      await store.loadAvatar(subject.okey);
    },

    /**
     * The person's email addresses that Firebase Auth already knows, from
     * `getAllocationEmails`.
     *
     * Fails CLOSED: when the lookup itself fails, every address is reported as taken, so the
     * account offer disappears rather than being made on an answer we do not have. The
     * allocation itself is unaffected — the admin can re-run it once the lookup works, and
     * `openAccount` is idempotent.
     */
    async loadTakenEmails(okey: string): Promise<string[]> {
      const allEmails = store.addresses()
        .filter(a => a.addressChannel === 'email' && !!a.email?.trim())
        .map(a => a.email.trim());
      try {
        const functions = getFunctions(getApp(), 'europe-west6');
        const lookup = httpsCallable(functions, 'getAllocationEmails');
        const result = await lookup({ okey });
        return (result.data as { taken: string[] }).taken ?? [];
      } catch (ex) {
        const message = 'Es liess sich nicht feststellen, welche Adressen schon einen Zugang haben.';
        patchState(store, { logTitle: message, log: logMessage([...store.log()], `${message} ${JSON.stringify(ex)}`) });
        return allEmails;
      }
    },

    /**
     * A drop or an arrow click. Opens the consent dialog and, on confirmation, calls
     * `allocateTenant`. The client never writes the records itself.
     */
    async move(tile: AllocationTile, direction: AllocationDirection): Promise<void> {
      const subject = store.subject();
      const meta = store.meta();
      if (!subject || !isDropAllowed(tile, direction)) return;

      // D-TA-3 / D-TA-8, spec §2: the dialog lists only documents the write would actually
      // touch — on a revoke what BOTH tenants carry (the target keeps what it collected
      // itself), on a grant what the target does NOT carry yet. On a first grant that second
      // filter is a no-op; on a top-up it is the whole point.
      const pending = eligibleAddresses(store.addresses(), tile.tenantId, direction);
      const groups = groupAddressesForConsent(pending);

      // A grant aimed at a tenant the record already has (D-TA-8). The record itself is not
      // travelling — it is already there — so only the gap is on offer, and when there is no
      // gap the dialog would be a page of dashes: say so instead of opening it. This is also
      // the whole answer to "do not create a duplicate": a top-up never writes the subject.
      const isTopUp = direction === 'grant' && subject.tenants.includes(tile.tenantId);
      // The avatar checkbox is offered only when the write would do something. Besides the
      // target-carries-it test that applies to every document, the bare avatar doc has one
      // special state: `tenants: ['system']` is the fleet-wide default, already in every
      // tenant's avatar stream — stamping the target onto it would change nothing, and the
      // callable rejects it anyway because the actor does not "carry" a system document.
      const avatarTenants = store.avatarTenants();
      const avatarPending = store.hasAvatar()
        && avatarTenants.includes(store.appStore.env.tenantId)
        && !avatarTenants.includes(SYSTEM_TENANT)
        && (direction === 'grant'
          ? !avatarTenants.includes(tile.tenantId)
          : avatarTenants.includes(tile.tenantId));
      if (isTopUp && pending.length === 0 && !avatarPending) {
        const message = `${tile.label}: ${store.i18n.allocation_topup_nothing()}`;
        patchState(store, { logTitle: message, log: logMessage([...store.log()], message) });
        return;
      }

      // Which of this person's addresses already carry a Firebase identity. Asked BEFORE the
      // dialog opens, because the answer decides whether the "open an account" checkbox is
      // offered at all: an email that already has an account resolves to the SAME uid, and a
      // uid belongs to exactly one tenant, so it can never become a second, target-tenant
      // login. A revoke never opens anything, and only a person can hold an account.
      const offersAccount = meta.canOpenAccount && direction === 'grant';
      const takenEmails = offersAccount ? await this.loadTakenEmails(subject.okey) : [];
      // Built from ALL of the actor's addresses, not just the pending ones: on a top-up an
      // address the target already carries is still a valid login for a new account there.
      const emailOptions = offersAccount ? buildEmailOptions(store.addresses(), takenEmails) : [];
      const carriedAddressKeys = direction === 'grant'
        ? store.addresses().filter(a => a.tenants.includes(tile.tenantId)).map(a => a.okey)
        : [];

      const modal = await store.modalController.create({
        component: TenantAllocationConfirmModal,
        componentProps: {
          i18n: {
            title: direction === 'revoke'
              ? store.i18n.allocation_revoke_title()
              : isTopUp ? store.i18n.allocation_topup_title() : store.i18n.allocation_grant_title(),
            blockAlways: store.i18n.allocation_block_always(),
            blockAlwaysHint: store.i18n.allocation_block_always_hint(),
            blockContact: store.i18n.allocation_block_contact(),
            blockSensitive: store.i18n.allocation_block_sensitive(),
            blockAvatar: store.i18n.allocation_block_avatar(),
            favoriteMarker: store.i18n.allocation_favorite_marker(),
            legalNote: store.i18n.allocation_legal_note(),
            ok: store.i18n.allocation_confirm_ok(),
            cancel: store.i18n.allocation_confirm_cancel(),
            accountTitle: store.i18n.allocation_account_title(),
            accountCheckbox: store.i18n.allocation_account_checkbox(),
            accountHint: store.i18n.allocation_account_hint(),
            accountEmailChoice: store.i18n.allocation_account_email_choice(),
          },
          groups,
          emailOptions,
          carriedAddressKeys,
          personLabel: subject.label,
          hasAvatar: avatarPending,
          isRevoke: direction === 'revoke',
          isTopUp,
        },
      });
      modal.present();
      const { data, role } = await modal.onWillDismiss<AllocationConfirmResult>();
      if (role !== 'confirm' || !data) return;

      try {
        const functions = getFunctions(getApp(), 'europe-west6');
        const allocate = httpsCallable(functions, 'allocateTenant');
        const result = await allocate({
          modelType: store.modelType(),
          okey: subject.okey,
          targetTenantId: tile.tenantId,
          direction,
          addressKeys: data.addressKeys,
          includeAvatar: data.includeAvatar,
          includeSubject: data.includeSubject,
          createAccount: data.createAccount,
          loginEmail: data.loginEmail,
        });
        const payload = result.data as AllocateTenantResponse;

        let entries: LogInfo[] = [];
        entries = logMessage(entries, `${store.i18n.allocation_conf()} ${JSON.stringify(payload.changed)}`);
        for (const r of payload.rejected) {
          entries = logMessage(entries, `${r.okey}: ${r.reason}`);
        }
        // Only reported when an account was actually asked for: `notRequested` is the normal
        // case and saying so on every allocation would be noise, not information.
        if (data.createAccount) {
          entries = payload.account?.created
            ? logMessage(entries, `${store.i18n.allocation_account_created()} ${payload.account.loginEmail ?? ''}`.trim())
            : logMessage(entries, `${store.i18n.allocation_account_failed()} (${payload.account?.reason ?? 'unknown'})`);
        }
        patchState(store, { logTitle: store.i18n.allocation_result(), log: entries });

        // The two columns redraw from `subject.tenants`, so that field must reflect what the
        // callable just wrote. Re-reading the document here is a race that cannot be won:
        // `readModel` is latency-compensated AND shares a ReplaySubject(1), so `firstValueFrom`
        // hands back the LOCAL snapshot — the one from before the callable's write — and the
        // grant appears to have done nothing until the page is reloaded. The subject count is
        // the server's own confirmation that the record's `tenants[]` was among the writes
        // (it counts exactly the one arrayUnion/arrayRemove the plan emitted), so derive the
        // new list from it instead of asking Firestore a question it answers from cache.
        const subjectChanged = (payload.changed[`${store.modelType()}s`] ?? 0) > 0;
        if (subjectChanged) {
          const tenants = direction === 'grant'
            ? [...new Set([...subject.tenants, tile.tenantId])]
            : subject.tenants.filter(t => t !== tile.tenantId);
          patchState(store, { subject: { ...subject, tenants } });
        }

        // A revoke can drop address documents (D-TA-3) as well as the tenants[] entry — the
        // stale `store.addresses()` list would otherwise carry rows into a second dialog in
        // the same session that the server just rejected as no-longer-actor-visible.
        await store.loadAddresses(subject.okey);
        await store.loadAvatar(subject.okey);
      } catch (ex) {
        error(store.toastController, `${store.i18n.allocation_error()} ${JSON.stringify(ex)}`);
      }
    },
  })),
);

/**
 * Every tenant that exists — `app-config` is world-readable, so this is one plain read.
 *
 * A free function, not a store method: the tenant list is the same for all three cards and is
 * loaded ONCE by the page, then handed to each card's store via `setTenantConfigs`.
 *
 * 'none' is load-bearing: getDataOnce defaults to orderBy('name'), and an orderBy on a field a
 * document does not have silently excludes that document. app-config docs have no `name`, so
 * the default would return an empty list and the right column would be permanently empty with
 * no error anywhere.
 */
export async function loadTenantConfigs(
  firestoreService: FirestoreService,
): Promise<Record<string, TenantConfigMeta>> {
  const docs = await firestoreService.getDataOnce<Record<string, unknown>>(AppConfigCollection, [], 'none');
  const configs: Record<string, TenantConfigMeta> = {};
  for (const doc of docs) {
    const id = doc['okey'] as string;
    if (!id) continue;
    configs[id] = {
      appName: doc['appName'] as string | undefined,
      logoUrl: doc['logoUrl'] as string | undefined,
      appDomain: doc['appDomain'] as string | undefined,
    };
  }
  return configs;
}

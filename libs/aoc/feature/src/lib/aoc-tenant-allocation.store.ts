import { computed, inject } from '@angular/core';
import { ModalController, ToastController } from '@ionic/angular/standalone';
import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';
import { getApp } from 'firebase/app';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { firstValueFrom } from 'rxjs';

import { FirestoreService } from '@okr/shared-data-access';
import { AppStore, PersonSelectModal, PersonSelectResult } from '@okr/shared-feature';
import { I18nService } from '@okr/shared-i18n';
import {
  AddressCollection, AddressModel, AllocationDirection, AppConfigCollection,
  AvatarCollection, AvatarModel, LogInfo, logMessage, PersonModel,
} from '@okr/shared-models';
import { error } from '@okr/shared-util-angular';
import { getSystemQuery, isPerson, SYSTEM_TENANT } from '@okr/shared-util-core';

import {
  AllocationTile, AOC_I18N_KEYS, buildEmailOptions, eligibleAddresses, groupAddressesForConsent,
  isDropAllowed, splitTenants, TenantConfigMeta,
} from '@okr/aoc-util';

import { AllocationConfirmResult, TenantAllocationConfirmModal } from './tenant-allocation-confirm.modal';

export type AocTenantAllocationState = {
  selectedPerson: PersonModel | undefined;
  addresses: AddressModel[];
  hasAvatar: boolean;
  /** The `tenants[]` of `avatars/person.<okey>` — decides whether the avatar checkbox has
   * anything left to do for a given target. */
  avatarTenants: string[];
  tenantConfigs: Record<string, TenantConfigMeta>;
  log: LogInfo[];
  logTitle: string;
};

const initialState: AocTenantAllocationState = {
  selectedPerson: undefined,
  addresses: [],
  hasAvatar: false,
  avatarTenants: [],
  tenantConfigs: {},
  log: [],
  logTitle: '',
};

/** The response shape of the `allocateTenant` Cloud Function. */
interface AllocateTenantResponse {
  changed: { persons: number; addresses: number; avatars: number };
  rejected: { okey: string; reason: string }[];
  logKey: string;
  account: { created: boolean; loginEmail?: string; reason?: string };
}

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
    /** Left and right column, derived from the person and the app-config docs. */
    lists: computed(() => {
      const person = store.selectedPerson();
      const configs = new Map(Object.entries(store.tenantConfigs()));
      return splitTenants(person?.tenants ?? [], [...configs.keys()], store.appStore.env.tenantId, configs);
    }),
  })),
  withMethods(store => ({
    /** Every tenant that exists — `app-config` is world-readable, so this is one plain read. */
    async loadTenantConfigs(): Promise<void> {
      // 'none' is load-bearing: getDataOnce defaults to orderBy('name'), and an orderBy on a
      // field a document does not have silently excludes that document. app-config docs have
      // no `name`, so the default would return an empty list and the right column would be
      // permanently empty with no error anywhere.
      const docs = await store.firestoreService.getDataOnce<Record<string, unknown>>(AppConfigCollection, [], 'none');
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
      if (docs.length === 0) {
        // an empty result is indistinguishable from a denied read (getDataOnce swallows every
        // error into []) — log it so the empty right-hand column is never silently confident.
        const message = 'Es wurden keine Mandanten gefunden. Das kann auch bedeuten, dass der Zugriff verweigert wurde.';
        patchState(store, { logTitle: message, log: logMessage([...store.log()], message) });
      }
      patchState(store, { tenantConfigs: configs });
    },

    async selectPerson(): Promise<void> {
      const modal = await store.modalController.create({
        component: PersonSelectModal,
        cssClass: 'list-modal',
        componentProps: { selectedTag: '', currentUser: store.appStore.currentUser() },
      });
      modal.present();
      const { data, role } = await modal.onWillDismiss<PersonSelectResult>();
      if (role === 'confirm' && data?.kind === 'predefined' && isPerson(data.person, store.appStore.env.tenantId)) {
        patchState(store, { selectedPerson: data.person });
        await this.loadAddresses(data.person.okey);
        await this.loadAvatar(data.person.okey);
      }
    },

    async loadAddresses(personKey: string): Promise<void> {
      // Same 'none' rule as above — AddressModel has no `name` field either. And the query is
      // tenant-scoped via getSystemQuery: the raw vault rule is tenant-scoped too, so an
      // unscoped query would just be denied, and getDataOnce swallows the denial and returns
      // [] — which reads as "this person has no addresses".
      const query = getSystemQuery(store.appStore.env.tenantId);
      query.push({ key: 'parentKey', operator: '==', value: `person.${personKey}` });
      const addresses = await store.firestoreService.getDataOnce<AddressModel>(AddressCollection, query, 'none');
      if (addresses.length === 0) {
        // same rationale as loadTenantConfigs: getDataOnce swallows a permission denial into [],
        // so an empty address list must not read as a confident "this person has no addresses".
        const message = 'Zu dieser Person wurden keine Adressen gefunden. Das kann auch bedeuten, dass der Zugriff verweigert wurde.';
        patchState(store, { logTitle: message, log: logMessage([...store.log()], message) });
      }
      patchState(store, { addresses: addresses.filter(a => !a.isArchived) });
    },

    /**
     * Whether the bare `avatars/person.<okey>` document exists — the only avatar doc the
     * target tenant of an allocation can ever read (see `allocate-tenant.ts`). A direct
     * point read by id, not a query, so the `getDataOnce` orderBy('name') pitfall does not
     * apply here.
     */
    async loadAvatar(personKey: string): Promise<void> {
      const avatar = await firstValueFrom(
        store.firestoreService.readModel<AvatarModel>(AvatarCollection, `person.${personKey}`),
      );
      patchState(store, { hasAvatar: !!avatar, avatarTenants: avatar?.tenants ?? [] });
    },

    clearPerson(): void {
      patchState(store, {
        selectedPerson: undefined, addresses: [], hasAvatar: false, avatarTenants: [], log: [], logTitle: '',
      });
    },
  })),
  withMethods(store => ({
    /**
     * The person's email addresses that Firebase Auth already knows, from
     * `getAllocationEmails`.
     *
     * Fails CLOSED: when the lookup itself fails, every address is reported as taken, so the
     * account offer disappears rather than being made on an answer we do not have. The
     * allocation itself is unaffected — the admin can re-run it once the lookup works, and
     * `openAccount` is idempotent.
     */
    async loadTakenEmails(personKey: string): Promise<string[]> {
      const allEmails = store.addresses()
        .filter(a => a.addressChannel === 'email' && !!a.email?.trim())
        .map(a => a.email.trim());
      try {
        const functions = getFunctions(getApp(), 'europe-west6');
        const lookup = httpsCallable(functions, 'getAllocationEmails');
        const result = await lookup({ okey: personKey });
        return (result.data as { taken: string[] }).taken ?? [];
      } catch (ex) {
        const message = 'Es liess sich nicht feststellen, welche Adressen schon einen Zugang haben.';
        patchState(store, { logTitle: message, log: logMessage([...store.log()], `${message} ${JSON.stringify(ex)}`) });
        return allEmails;
      }
    },

    /**
     * A drop or an arrow click. Opens the consent dialog and, on confirmation, calls
     * `allocateTenant`. The client never writes persons/addresses/avatars itself.
     */
    async move(tile: AllocationTile, direction: AllocationDirection): Promise<void> {
      const person = store.selectedPerson();
      if (!person || !isDropAllowed(tile, direction)) return;

      // D-TA-3 / D-TA-8, spec §2: the dialog lists only documents the write would actually
      // touch — on a revoke what BOTH tenants carry (the target keeps what it collected
      // itself), on a grant what the target does NOT carry yet. On a first grant that second
      // filter is a no-op; on a top-up it is the whole point.
      const pending = eligibleAddresses(store.addresses(), tile.tenantId, direction);
      const groups = groupAddressesForConsent(pending);

      // A grant aimed at a tenant the person already has (D-TA-8). The person document is not
      // travelling — it is already there — so only the gap is on offer, and when there is no
      // gap the dialog would be a page of dashes: say so instead of opening it.
      const isTopUp = direction === 'grant' && person.tenants.includes(tile.tenantId);
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
      // login. A revoke never opens anything, so it does not ask.
      const takenEmails = direction === 'grant' ? await this.loadTakenEmails(person.okey) : [];
      // Built from ALL of the actor's addresses, not just the pending ones: on a top-up an
      // address the target already carries is still a valid login for a new account there.
      const emailOptions = buildEmailOptions(direction === 'grant' ? store.addresses() : pending, takenEmails);
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
          personLabel: `${person.firstName} ${person.lastName}`,
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
          modelType: 'person',
          okey: person.okey,
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

        // The two columns redraw from `selectedPerson.tenants`, so that field must reflect what
        // the callable just wrote. Re-reading the document here is a race that cannot be won:
        // `readModel` is latency-compensated AND shares a ReplaySubject(1), so `firstValueFrom`
        // hands back the LOCAL snapshot — the one from before the callable's write — and the
        // grant appears to have done nothing until the page is reloaded. `changed.persons` is
        // the server's own confirmation that `persons/{okey}.tenants` was among the writes
        // (it counts exactly the one arrayUnion/arrayRemove the plan emitted), so derive the
        // new list from it instead of asking Firestore a question it answers from cache.
        if (payload.changed.persons > 0) {
          const tenants = direction === 'grant'
            ? [...new Set([...person.tenants, tile.tenantId])]
            : person.tenants.filter(t => t !== tile.tenantId);
          patchState(store, { selectedPerson: { ...person, tenants } });
        }

        // A revoke can drop address documents (D-TA-3) as well as the tenants[] entry — the
        // stale `store.addresses()` list would otherwise carry rows into a second dialog in
        // the same session that the server just rejected as no-longer-actor-visible.
        await store.loadAddresses(person.okey);
        await store.loadAvatar(person.okey);
      } catch (ex) {
        error(store.toastController, `${store.i18n.allocation_error()} ${JSON.stringify(ex)}`);
      }
    },
  })),
);

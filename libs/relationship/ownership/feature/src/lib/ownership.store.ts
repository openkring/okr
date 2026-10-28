import { computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { ActionSheetController, AlertController, ModalController, ToastController } from '@ionic/angular';
import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';
import { firstValueFrom } from 'rxjs';

import { ownerTypeMatches } from '@okr/shared-categories';
import { AppStore } from '@okr/shared-feature';
import { OrgModel, OwnershipModel, PersonModel, PersonModelName, ResourceModel } from '@okr/shared-models';
import { selectDate } from '@okr/shared-ui';
import { confirm, exportCsv, getExportFileName, okrPrompt, selectNestedAction, showToast } from '@okr/shared-util-angular';
import { buildExportTable, chipMatches, convertDateFormatToString, DateFormat, debugListLoaded, die, fill, getAvatarInfo, getItemLabel, getTodayStr, hasRole, isAfterDate, isOngoing, isOwnership, isResource, nameMatches } from '@okr/shared-util-core';
import { DEFAULT_RBOAT_TYPE, DEFAULT_RESOURCE_TYPE } from '@okr/shared-constants';
import { I18nService } from '@okr/shared-i18n';

import { OwnershipService } from '@okr/relationship-ownership-data-access';
import { ReservationService } from '@okr/relationship-reservation-data-access';
import { findActiveLockReservations, LOCK_REASONS, isReservationActiveNow } from '@okr/relationship-reservation-util';
import { ResourceService } from '@okr/resource-data-access';
import { RESOURCE_EDIT_MODAL } from '@okr/resource-ui';
import { ORG_EDIT_MODAL } from '@okr/subject-org-ui';
import { PERSON_EDIT_MODAL } from '@okr/subject-person-ui';
import { getOwnershipExportColumns, getOwnershipExportFileName, getResourceActionEntries, newOwnership, OWNERSHIP_I18N_KEYS, RESOURCE_ACTION } from '@okr/relationship-ownership-util';

export type OwnershipState = {
  // accordion state
  ownerModelType: 'person' | 'org';
  ownerKey: string;
  showOnlyCurrent: boolean;
  resourceKey: string;

  // filters
  searchTerm: string;
  selectedTag: string;
  selectedOwnershipType: string;
  selectedResourceType: string;
  selectedYear: number;
  selectedModelType: 'person' | 'org' | 'all';
  selectedGender: string;
  selectedOrgType: string;
  selectedRowingBoatType: string;
  yearField: 'validFrom' | 'validTo';
};

const initialState: OwnershipState = {
  ownerKey: '',
  showOnlyCurrent: false,
  ownerModelType: 'person',
  resourceKey: '',

  // filters
  searchTerm: '',
  selectedTag: '',
  selectedOwnershipType: 'all',
  selectedResourceType: 'all',
  selectedYear: parseInt(getTodayStr(DateFormat.Year)),
  selectedModelType: 'all',
  selectedGender: 'all',
  selectedOrgType: 'all',
  selectedRowingBoatType: 'all',
  yearField: 'validFrom',
};


export const OwnershipStore = signalStore(
  withState(initialState),
  withProps(() => ({
    ownershipService: inject(OwnershipService),
    resourceService: inject(ResourceService),
    reservationService: inject(ReservationService),
    appStore: inject(AppStore),
    modalController: inject(ModalController),
    alertController: inject(AlertController),
    toastController: inject(ToastController),
    actionSheetController: inject(ActionSheetController),
    i18nService: inject(I18nService),
    // optional: only needed by the resource actions; provided by the route/list that offers them
    resourceEditModal: inject(RESOURCE_EDIT_MODAL, { optional: true }),
    // provided by every app (app.config.ts)
    personEditModal: inject(PERSON_EDIT_MODAL, { optional: true }),
    orgEditModal: inject(ORG_EDIT_MODAL, { optional: true }),
  })),

  withProps((store) => ({
    i18n: store.i18nService.translateAll(OWNERSHIP_I18N_KEYS),

    // all ownerships of this tenant
    allOwnershipsResource: rxResource({
      stream: () => {
        return store.ownershipService.list().pipe(
          debugListLoaded('OwnershipStore.allOwnerships', store.appStore.currentUser())
        );
      }
    }),

    // all reservations of this tenant — only the lock reservations matter here (locked boats)
    reservationsResource: rxResource({
      stream: () => store.reservationService.list()
    })
  })),

  // list types
  withComputed((state) => {
    return {
      currentUser: computed(() => state.appStore.currentUser()),
      currentPerson: computed(() => state.appStore.currentPerson()),
      defaultResource: computed(() => state.appStore.defaultResource()),
      tenantId: computed(() => state.appStore.tenantId()),

      // all ownerships, either only the current ones or all that ever existed (based on showOnlyCurrent)
      allOwnerships: computed(() => state.showOnlyCurrent() ? 
        state.allOwnershipsResource.value()?.filter(m => isAfterDate(m.validTo, getTodayStr(DateFormat.StoreDate))) ?? [] : 
        state.allOwnershipsResource.value() ?? []),

      isLoading: computed(() => state.allOwnershipsResource.isLoading()),

      // keys of the resources that are locked right now (damage report or «sperren»), marked red in the lists
      lockedResourceKeys: computed(() => new Set((state.reservationsResource.value() ?? [])
        .filter(r => LOCK_REASONS.includes(r.reason) && isReservationActiveNow(r))
        .map(r => r.resource?.key ?? '')
        .filter(key => key.length > 0))),

      // all ownerships of a given owner (person or org). This can be used e.g. in ownership-accordion
      ownerships: computed(() => {
        if (!state.ownerKey() || state.ownerKey().length === 0) return [];
        if (!state.ownerModelType()) return [];
        return state.allOwnershipsResource.value()?.filter((ownership: OwnershipModel) =>
        ownership.ownerKey === state.ownerKey()) ?? []
      }),

      // all ownerships of the resource in state.resourceKey (resource owners accordion), most recent first
      resourceOwnerships: computed(() => {
        if (!state.resourceKey()) return [];
        return (state.allOwnershipsResource.value() ?? [])
          .filter((ownership: OwnershipModel) => ownership.resourceKey === state.resourceKey())
          .sort((a, b) => (b.validFrom ?? '').localeCompare(a.validFrom ?? ''));
      }),

      // all owners of a given resource
      owners: computed(() => {
        if (!state.ownerKey() || state.ownerKey().length === 0) return [];
        return Array.from(new Set(state.allOwnershipsResource.value()
          ?.filter((ownership: OwnershipModel) => ownership.resourceKey === state.ownerKey())
          .map((ownership: OwnershipModel) => ownership.ownerKey)));
      }),

      lockers: computed(() => state.allOwnershipsResource.value()?.filter((ownership: OwnershipModel) =>
        ownership.resourceModelType === 'resource' &&
        ownership.resourceType === 'locker' &&
        isAfterDate(ownership.validTo, getTodayStr(DateFormat.StoreDate))) ?? []),

      keys: computed(() => state.allOwnershipsResource.value()?.filter((ownership: OwnershipModel) =>
        ownership.resourceModelType === 'resource' &&
        ownership.resourceType === 'key' &&
        isAfterDate(ownership.validTo, getTodayStr(DateFormat.StoreDate))) ?? []),

      privateBoats: computed(() => state.allOwnershipsResource.value()?.filter((ownership: OwnershipModel) =>
        ownership.resourceModelType === 'resource' &&
        ownership.resourceType === 'rboat' &&
        ownership.ownerModelType === 'person' &&
        isAfterDate(ownership.validTo, getTodayStr(DateFormat.StoreDate))) ?? []),
  
      scsBoats: computed(() => state.allOwnershipsResource.value()?.filter((ownership: OwnershipModel) =>
        ownership.resourceModelType === 'resource' &&
        ownership.resourceType === 'rboat' &&
        ownership.ownerKey === 'scs' &&
        isAfterDate(ownership.validTo, getTodayStr(DateFormat.StoreDate))) ?? [])
    };
  }),

  // filters
  withComputed((state) => {
    return {
      // all ownerships
      allOwnershipsCount: computed(() => state.allOwnerships().length),
      ownershipsCount: computed(() => state.ownerships().length),
      filteredAllOwnerships: computed(() => 
        state.allOwnerships().filter((ownership: OwnershipModel) => 
          nameMatches(ownership.index, state.searchTerm()) &&
          chipMatches(ownership.tags, state.selectedTag()) &&
          nameMatches(ownership.resourceType ?? DEFAULT_RESOURCE_TYPE, state.selectedResourceType()) &&
          ownerTypeMatches(ownership, state.selectedModelType(), state.selectedGender(), state.selectedOrgType()))
      ),
      filteredOwnerships: computed(() => 
        state.ownerships().filter((ownership: OwnershipModel) => 
          nameMatches(ownership.index, state.searchTerm()) &&
          chipMatches(ownership.tags, state.selectedTag()) &&
          nameMatches(ownership.resourceType ?? DEFAULT_RESOURCE_TYPE, state.selectedResourceType()) &&
          ownerTypeMatches(ownership, state.selectedModelType(), state.selectedGender(), state.selectedOrgType()))
      ),

      // lockers
      lockersCount: computed(() => state.lockers().length ?? 0), 
      filteredLockers: computed(() =>
        state.lockers().filter((ownership: OwnershipModel) => 
          nameMatches(ownership.index, state.searchTerm()) &&
          chipMatches(ownership.tags, state.selectedTag()) &&
          nameMatches(ownership.resourceType ?? DEFAULT_RESOURCE_TYPE, state.selectedResourceType()) &&
          ownerTypeMatches(ownership, state.selectedModelType(), state.selectedGender(), state.selectedOrgType()))
      ),

      // keys
      keysCount: computed(() => state.keys().length ?? 0), 
      filteredKeys: computed(() => 
        state.keys()?.filter((ownership: OwnershipModel) => 
          nameMatches(ownership.index, state.searchTerm()) &&
          chipMatches(ownership.tags, state.selectedTag()) &&
          nameMatches(ownership.resourceType ?? DEFAULT_RESOURCE_TYPE, state.selectedResourceType()) &&
          ownerTypeMatches(ownership, state.selectedModelType(), state.selectedGender(), state.selectedOrgType()))
      ),

      // private boats
      privateBoatsCount: computed(() => state.privateBoats().length ?? 0), 
      filteredPrivateBoats: computed(() => 
        state.privateBoats()?.filter((ownership: OwnershipModel) => 
          nameMatches(ownership.index, state.searchTerm()) &&
          chipMatches(ownership.tags, state.selectedTag()) &&
          nameMatches(ownership.resourceType ?? DEFAULT_RESOURCE_TYPE, state.selectedResourceType()) &&
          ownerTypeMatches(ownership, state.selectedModelType(), state.selectedGender(), state.selectedOrgType()))
      ),
      
      // scs boats
      scsBoatsCount: computed(() => state.scsBoats().length ?? 0), 
      filteredScsBoats: computed(() => 
        state.scsBoats()?.filter((ownership: OwnershipModel) => 
        nameMatches(ownership.index, state.searchTerm()) &&
        chipMatches(ownership.tags, state.selectedTag()) &&
        nameMatches(ownership.resourceSubType ?? DEFAULT_RBOAT_TYPE, state.selectedRowingBoatType())
      )),
    }
  }),

  withMethods((store) => {
    return {
      reset() {
        patchState(store, initialState);
      },
      reload() {
        store.allOwnershipsResource.reload();
      },

      /******************************** setters (filter) ******************************************* */
      setOwnerKey(ownerKey: string) {
        patchState(store, { ownerKey });
      },

      setResourceKey(resourceKey: string) {
        patchState(store, { resourceKey });
      },

      setShowMode(showOnlyCurrent: boolean) {
        patchState(store, { showOnlyCurrent });
      },

      setYearField(yearField: 'validFrom' | 'validTo') {
        patchState(store, { yearField });
      },
      
      setSearchTerm(searchTerm: string) {
        patchState(store, { searchTerm });
      },

      setSelectedOwnershipType(selectedOwnershipType: string) {
        patchState(store, { selectedOwnershipType });
      },

      setSelectedResourceType(selectedResourceType: string) {
        patchState(store, { selectedResourceType });
      },

      setSelectedYear(selectedYear: number) {
        patchState(store, { selectedYear });
      },

      setSelectedGender(selectedGender: string) {
        patchState(store, { selectedGender, selectedModelType: 'person' });
      },

      setSelectedOrgType(selectedOrgType: string) {
        patchState(store, { selectedOrgType, selectedModelType: 'org' });
      },

      setSelectedRowingBoatType(selectedRowingBoatType: string) {
        patchState(store, { selectedRowingBoatType });
      },

      setSelectedTag(selectedTag: string) {
        patchState(store, { selectedTag });
      },

      setSelectedOwnerType(ownerType: string) {
        switch(ownerType) {
          case 'persons': 
            patchState(store, { 
              selectedModelType: 'person',
              selectedGender: 'all',
            }); 
            break;
          case 'men':     
            patchState(store, { 
              selectedModelType: 'person',
              selectedGender: 'male',
            }); 
            break;
          case 'women':   
            patchState(store, { 
              selectedModelType: 'person',
              selectedGender: 'female',
            }); 
            break;
          case 'orgs':     
            patchState(store, {
              selectedModelType: 'org',
              selectedOrgType: 'all',
            }); 
            break;
          case 'all':
            patchState(store, {
              selectedModelType: 'all',
              selectedGender: 'all',
              selectedOrgType: 'all',
            });
            break;
          default:
            die('OwnershipListStore: unknown ownerType ' + ownerType);
        }
      },

      setOwner(ownerKey: string, ownerModelType: 'person' | 'org'): void {
        patchState(store, { ownerKey, ownerModelType });
        this.reload();
      },  

      /******************************** getters ******************************************* */
      getTags(): string {
        return store.appStore.getTags('ownership');
      },

      /******************************* actions *************************************** */
      /**
       * Show a modal to add a new Ownership.
       * @param readOnly 
       * @returns 
       */
      async add(givenOwner?: PersonModel | OrgModel, ownerModelType: 'person' | 'org' = 'person', givenResource?: ResourceModel, readOnly = true): Promise<void> {
        if (readOnly) return;
        const owner = givenOwner ?? store.appStore.currentPerson();
        const resource = givenResource ?? store.appStore.defaultResource();
        if (!owner || !resource) return;
        const ownership = newOwnership(owner, resource, store.tenantId(), ownerModelType);
        const { OwnershipNewModal } = await import('./ownership-new.modal');
        const modal = await store.modalController.create({
          component: OwnershipNewModal,
          cssClass: 'small-modal',
          componentProps: {
            ownership,
            currentUser: store.appStore.currentUser()
          }
        });
        modal.present();
        const { data, role } = await modal.onDidDismiss();
        if (role === 'confirm' && data) {
          if (isOwnership(data, store.tenantId())) {
            await store.ownershipService.create(data, store.currentUser());
          }
        }
        this.reload();
      },

      /**
       * Show a modal to edit an existing Ownership.
       * @param ownership the Ownership to edit
       * @param readOnly 
       */
      async edit(ownership: OwnershipModel, readOnly = true): Promise<void> {
        const { OwnershipEditModal } = await import('./ownership-edit.modal');
        const modal = await store.modalController.create({
          component: OwnershipEditModal,
          componentProps: {
            ownership,
            currentUser: store.currentUser(),
            readOnly
          }
        });
        modal.present();
        const { data, role } = await modal.onDidDismiss();
        if (role === 'confirm' && data && !readOnly) {
          if (isOwnership(data, store.tenantId())) {
            await (!data.okey ? 
              store.ownershipService.create(data, store.currentUser()) : 
              store.ownershipService.update(data, store.currentUser()));
          }
        }
        this.reload();
      },

      /**
       * End an existing Ownership.
       * We do not archive ownerships as we want to make them visible in the lists.
       * Therefore, we end an ownership by setting its validTo date.
       * @param ownership the Ownership to delete, its okey needs to be valid so that we can find it in the database. 
       */
      async end(ownership: OwnershipModel, readOnly = true): Promise<void> {
        if (!readOnly && ownership) {
          const date = await selectDate(store.modalController);
          if (!date) return;
          await store.ownershipService.endOwnershipByDate(ownership, convertDateFormatToString(date, DateFormat.IsoDate, DateFormat.StoreDate, false), store.currentUser());              
          this.reload();
        }
      },   

      /**
       * Show a modal to edit/view a resource (e.g. a rowing boat).
       * There is no resource detail route, so we open the resource edit modal directly. The modal lives in
       * @okr/resource-feature and is resolved through RESOURCE_EDIT_MODAL (resource-feature depends on us).
       * @param resource the resource to open
       * @param readOnly whether the modal opens in read-only (view) mode
       */
      async openResource(resource: ResourceModel, readOnly = true): Promise<void> {
        if (!store.resourceEditModal) {
          console.error('OwnershipStore.openResource: RESOURCE_EDIT_MODAL is not provided.');
          return;
        }
        const component = await store.resourceEditModal();
        const modal = await store.modalController.create({
          component,
          componentProps: { resource, isTypeEditable: false, readOnly }
        });
        modal.present();
        const { data, role } = await modal.onDidDismiss();
        if (role === 'confirm' && data && !readOnly && isResource(data, store.tenantId())) {
          await store.resourceService.update(data, store.currentUser());
          store.appStore.reloadResources();
        }
        this.reload();
      },

      /**
       * Open the owner (person or org) of an ownership in its edit modal, on top of the current page.
       * The modals live in the subject feature libs and come through the loader tokens the apps provide.
       * @param ownership the Ownership whose owner should be opened
       * @param readOnly whether the modal opens in read-only (view) mode
       */
      async openOwner(ownership: OwnershipModel, readOnly = true): Promise<void> {
        if (!ownership.ownerKey) return;
        let component, componentProps;
        if (ownership.ownerModelType === 'org') {
          const org = store.appStore.getOrg(ownership.ownerKey);
          if (!org || !store.orgEditModal) { console.warn(`OwnershipStore.openOwner: org ${ownership.ownerKey} or ORG_EDIT_MODAL not available`); return; }
          component = await store.orgEditModal();
          componentProps = {
            org,
            currentUser: store.currentUser(),
            tags: store.appStore.getTags('org'),
            tenantId: store.tenantId(),
            types: store.appStore.getCategory('org_type'),
            readOnly
          };
        } else {
          const person = store.appStore.getPerson(ownership.ownerKey);
          if (!person || !store.personEditModal) { console.warn(`OwnershipStore.openOwner: person ${ownership.ownerKey} or PERSON_EDIT_MODAL not available`); return; }
          component = await store.personEditModal();
          componentProps = {
            person,
            currentUser: store.currentUser(),
            tags: store.appStore.getTags(PersonModelName),
            tenantId: store.tenantId(),
            genders: store.appStore.getCategory('gender'),
            readOnly
          };
        }
        const modal = await store.modalController.create({ component, componentProps });
        await modal.present();
        await modal.onDidDismiss();
      },

      /**
       * «Nutzung hinzufügen» for a given resource: opens OwnershipNewModal pre-filled with the resource,
       * today as start date and the tenant's default org as user. The user can be changed there
       * (persons and orgs, one segment each).
       * @param resource the resource that gets a new ownership
       * @param readOnly
       */
      async addOwnershipFor(resource: ResourceModel, readOnly = true): Promise<void> {
        if (readOnly) return;
        const org = store.appStore.defaultOrg();
        if (org) {
          await this.add(org, 'org', resource, readOnly);
        } else {
          await this.add(store.appStore.currentPerson(), 'person', resource, readOnly);
        }
      },

      /******************************* resource action sheet *************************************** */
      /**
       * The current (not yet ended) Nutzung of a resource; the most recent one if there are several.
       */
      /** Whether the resource is locked right now (an active 'maintenance' or 'blocked' reservation). */
      isLocked(resourceKey: string | undefined): boolean {
        return !!resourceKey && store.lockedResourceKeys().has(resourceKey);
      },

      currentOwnershipOf(resourceKey: string): OwnershipModel | undefined {
        return (store.allOwnershipsResource.value() ?? [])
          .filter(o => o.resourceKey === resourceKey && isAfterDate(o.validTo, getTodayStr(DateFormat.StoreDate)))
          .sort((a, b) => (b.validFrom ?? '').localeCompare(a.validFrom ?? ''))[0];
      },

      /**
       * The two-level ActionSheet of the resource lists and the ownership lists (see getResourceActionEntries):
       * «<resource type>…», «Nutzer/in anzeigen», «Nutzung…». Only the actions the user may use are offered.
       * @param resource the row's resource (resource lists); loaded on demand for an ownership row
       * @param ownership the row's ownership (ownership lists) or the resource's current one
       * @param withResource false inside the resource's own modal: no «<resource type>…» group, no «hinzufügen»
       * @returns the executed action, so that the caller can refresh its own store
       */
      async showResourceActions(resource: ResourceModel | undefined, ownership: OwnershipModel | undefined, withResource = true): Promise<string | undefined> {
        const resourceKey = resource?.okey || ownership?.resourceKey || '';
        const resourceType = resource?.type ?? ownership?.resourceType ?? '';
        const user = store.currentUser();
        const writable = hasRole('resourceAdmin', user);
        const i18n = store.i18n;
        const resourceTypes = store.appStore.tryGetCategory('resource_type');
        const typeLabel = resourceTypes ? getItemLabel(resourceTypes, resourceType) : resourceType;
        const entries = getResourceActionEntries(
          { canRead: hasRole('registered', user), canWrite: writable, isAdmin: hasRole('admin', user),
            canLock: hasRole('privileged', user) || writable },
          { hasResource: withResource && resourceKey.length > 0, hasOwnership: !!ownership, isOngoing: !!ownership && isOngoing(ownership.validTo),
            isLockable: resourceType === 'rboat', isLocked: this.isLocked(resourceKey) },
          {
            resource: typeLabel.startsWith('@') ? await store.i18nService.translateOnce(typeLabel) : typeLabel,
            resourceIcon: store.appStore.getCategoryItem('resource_type', resourceType)?.icon,
            ownership: i18n.ownership(), ownerView: i18n.action_ownerView(),
            add: i18n.action_add(), view: i18n.action_view(), edit: i18n.action_edit(), end: i18n.action_end(),
            archive: i18n.action_archive(), delete: i18n.action_delete(),
            lock: i18n.action_lock(), unlock: i18n.action_unlock()
          });
        const combine = (group: string, action: string): string => {
          const text = fill(i18n.action_combine() || '{group} {action}', { group, action });
          return text.charAt(0).toUpperCase() + text.slice(1);
        };
        const action = await selectNestedAction(store.actionSheetController, i18n.as_title(), entries, i18n.cancel(),
          store.appStore.env.services.imgixBaseUrl, combine);
        if (!action) return undefined;

        const loadResource = async () => resource ?? await firstValueFrom(store.resourceService.read(resourceKey));
        switch (action) {
          case RESOURCE_ACTION.resourceView:
          case RESOURCE_ACTION.resourceEdit: {
            const res = await loadResource();
            if (res) await this.openResource(res, action === RESOURCE_ACTION.resourceView || !writable);
            break;
          }
          case RESOURCE_ACTION.resourceLock: {
            const res = await loadResource();
            if (res) await this.lockResource(res);
            break;
          }
          case RESOURCE_ACTION.resourceUnlock: {
            const res = await loadResource();
            if (res) await this.unlockResource(res);
            break;
          }
          case RESOURCE_ACTION.resourceArchive: {
            const res = await loadResource();
            if (res) await this.archiveResource(res);
            break;
          }
          case RESOURCE_ACTION.resourceDelete: {
            const res = await loadResource();
            if (res) await this.purgeResource(res);
            break;
          }
          case RESOURCE_ACTION.ownerView:
            if (ownership) await this.openOwner(ownership, true);
            break;
          case RESOURCE_ACTION.ownershipAdd: {
            const res = await loadResource();
            if (res) await this.addOwnershipFor(res, !writable);
            break;
          }
          case RESOURCE_ACTION.ownershipView:
            if (ownership) await this.edit(ownership, true);
            break;
          case RESOURCE_ACTION.ownershipEdit:
            if (ownership) await this.edit(ownership, !writable);
            break;
          case RESOURCE_ACTION.ownershipEnd:
            if (ownership) await this.end(ownership, !writable);
            break;
          case RESOURCE_ACTION.ownershipArchive:
            if (ownership) await this.archive(ownership);
            break;
          case RESOURCE_ACTION.ownershipDelete:
            if (ownership) await this.purge(ownership);
            break;
        }
        return action;
      },

      /**
       * «Ruderboot sperren»: asks for the reason, stores an open-ended lock reservation (the Logbuch
       * then refuses the boat) and shows the reason as the boat's tripAlert. privileged / resourceAdmin.
       */
      async lockResource(resource: ResourceModel): Promise<void> {
        const user = store.currentUser();
        if (!hasRole('privileged', user) && !hasRole('resourceAdmin', user)) return;
        const reason = await okrPrompt(store.alertController, store.i18n.lock_header(), store.i18n.lock_placeholder(),
          store.i18n.ok(), store.i18n.cancel(), resource.tripAlert ?? '');
        if (reason === undefined) return;   // cancelled
        const avatar = getAvatarInfo(resource, 'resource');
        if (!avatar) return;
        const key = await store.reservationService.lockResource(avatar, reason, user);
        if (!key) return;   // the service already showed the error toast
        if (reason.trim() !== (resource.tripAlert ?? '').trim()) {
          await store.resourceService.update({ ...resource, tripAlert: reason.trim() }, user);
          store.appStore.reloadResources();
        }
        store.reservationsResource.reload();
      },

      /** «Sperrung aufheben»: ends every active lock of the resource and clears its tripAlert. privileged / resourceAdmin. */
      async unlockResource(resource: ResourceModel): Promise<void> {
        const user = store.currentUser();
        if (!hasRole('privileged', user) && !hasRole('resourceAdmin', user)) return;
        const locks = findActiveLockReservations(store.reservationsResource.value() ?? [], resource.okey);
        await store.reservationService.unlockResource(locks, user);
        if (resource.tripAlert) {
          await store.resourceService.update({ ...resource, tripAlert: '' }, user);
          store.appStore.reloadResources();
        }
        store.reservationsResource.reload();
      },

      /** Archive a resource (isArchived = true). admin only. */
      async archiveResource(resource: ResourceModel): Promise<void> {
        if (!hasRole('admin', store.currentUser())) return;
        const message = fill(store.i18n.resource_archive_confirm(), { name: resource.name });
        if (!await confirm(store.alertController, message, store.i18n.ok(), store.i18n.cancel(), true)) return;
        await store.resourceService.archive(resource, store.currentUser());
        store.appStore.reloadResources();
      },

      /**
       * Delete a resource physically in the database. admin only.
       * Refused while ownerships still point to it (they would dangle) and for a resource that is
       * shared with another tenant (deleting it would remove it there too; see the deleting-models skill).
       */
      async purgeResource(resource: ResourceModel): Promise<void> {
        if (!hasRole('admin', store.currentUser())) return;
        if ((resource.tenants ?? []).length > 1) {
          showToast(store.toastController, store.i18n.purge_shared());
          return;
        }
        if ((store.allOwnershipsResource.value() ?? []).some(o => o.resourceKey === resource.okey)) {
          showToast(store.toastController, fill(store.i18n.resource_purge_inUse(), { name: resource.name }));
          return;
        }
        const message = fill(store.i18n.resource_purge_confirm(), { name: resource.name });
        if (!await confirm(store.alertController, message, store.i18n.ok(), store.i18n.cancel(), true)) return;
        await store.resourceService.purge(resource, store.currentUser());
        store.appStore.reloadResources();
      },

      /** Archive an ownership (isArchived = true). admin only. */
      async archive(ownership: OwnershipModel): Promise<void> {
        if (!hasRole('admin', store.currentUser())) return;
        if (!await confirm(store.alertController, store.i18n.archive_confirm(), store.i18n.ok(), store.i18n.cancel(), true)) return;
        await store.ownershipService.archive(ownership, store.currentUser());
        this.reload();
      },

      /** Delete an ownership physically in the database. admin only. */
      async purge(ownership: OwnershipModel): Promise<void> {
        if (!hasRole('admin', store.currentUser())) return;
        if ((ownership.tenants ?? []).length > 1) {
          showToast(store.toastController, store.i18n.purge_shared());
          return;
        }
        if (!await confirm(store.alertController, store.i18n.purge_confirm(), store.i18n.ok(), store.i18n.cancel(), true)) return;
        await store.ownershipService.purge(ownership, store.currentUser());
        this.reload();
      },

      /**
       * Export the currently filtered rows of an ownership list as a CSV file.
       * @param type the export flavour; only 'raw' exists today (menuItem `ownership-exportraw`)
       * @param listId the list being exported — it decides both the rows and the columns
       */
      async export(type: string, listId = 'all'): Promise<void> {
        if (type !== 'raw') {
          console.warn(`OwnershipStore.export: type ${type} is not supported.`);
          return;
        }
        const ownerships = listId === 'ownerships'   ? store.filteredOwnerships()   ?? [] :
                           listId === 'lockers'      ? store.filteredLockers()      ?? [] :
                           listId === 'keys'         ? store.filteredKeys()         ?? [] :
                           listId === 'privateBoats' ? store.filteredPrivateBoats() ?? [] :
                           listId === 'scsBoats'     ? store.filteredScsBoats()     ?? [] :
                                                       store.filteredAllOwnerships() ?? [];
        if (ownerships.length === 0) {
          showToast(store.toastController, store.i18n.export_empty());
          return;
        }
        // Coded values render as i18n keys, so they must be resolved before the (synchronous)
        // cell accessors run. `type` and `state` have no category document behind them — the
        // value resolver falls back to the raw code when a key is missing.
        const [resourceType, rboatType, gender, ownershipType, state] = await Promise.all([
          store.i18nService.createLabelResolver(store.appStore.getCategory('resource_type')),
          store.i18nService.createLabelResolver(store.appStore.getCategory('rboat_type')),
          store.i18nService.createLabelResolver(store.appStore.getCategory('gender')),
          store.i18nService.createValueResolver('@relationship/ownership/feature.ocat', ownerships.map(o => o.type)),
          store.i18nService.createValueResolver('@relationship/ownership/feature.ostate', ownerships.map(o => o.state)),
        ]);
        const columns = getOwnershipExportColumns(listId, store.i18n, { resourceType, rboatType, gender, type: ownershipType, state });
        await exportCsv(buildExportTable(ownerships, columns), getExportFileName(getOwnershipExportFileName(listId), 'csv'));
        showToast(store.toastController, store.i18n.export_conf());
      },

      async delete(ownership?: OwnershipModel, readOnly = true): Promise<void> {
        if (!readOnly && ownership) {
          const result = await confirm(store.alertController, store.i18n.delete_confirm(), store.i18n.ok(), store.i18n.cancel(), true);
          if (result === true) {
            await store.ownershipService.delete(ownership, store.currentUser());
            this.reload();
          }
        }
      },

      getTitleLabel(readOnly: boolean, key?: string): string {
        if (readOnly) {
          return store.i18n.view();
        }
        if (key && key.length > 0) {
          return store.i18n.update();
        } else {
          return store.i18n.create();
        }
      },
    }
  }),
);

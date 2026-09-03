import { computed, inject, Injector } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { AlertController, ModalController, ToastController } from '@ionic/angular/standalone';
import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';
import { of, take } from 'rxjs';

import { yearMatches } from '@okr/shared-categories';
import { FirestoreService } from '@okr/shared-data-access';
import { AppStore, PersonSelectModal, PersonSelectResult, ResourceSelectModal } from '@okr/shared-feature';
import { confirm, exportCsv, getExportFileName, navigateByUrl, showToast } from '@okr/shared-util-angular';
import { CalEventCollection, CalEventModel, CategoryListModel, OrgModel, PersonModel, PersonModelName, ReservationModel, ResourceCollection, ResourceModel } from '@okr/shared-models';
import { selectDate } from '@okr/shared-ui';
import { buildExportTable, chipMatches, convertDateFormatToString, DateFormat, debugItemLoaded, debugListLoaded, findByKey, getAvatarInfo, getCategoryIcon, getSystemQuery, getYear, isPerson, isResource, isValidAt, nameMatches } from '@okr/shared-util-core';
import { I18nService } from '@okr/shared-i18n';

import { ReservationService } from '@okr/relationship-reservation-data-access';
import { getReservationExportColumns, getReservationExportFileName, isReservation, RESERVATION_I18N_KEYS, ReservationI18n } from '@okr/relationship-reservation-util';
import { PersonService } from '@okr/subject-person-data-access';
import { PERSON_EDIT_MODAL } from '@okr/subject-person-ui';

import { CalEventEditModal } from '@okr/calevent-feature';
import { isCalEvent } from '@okr/calevent-util';
import { browseUrl } from '@okr/subject-address-util';
import type { MatrixChatService } from '@okr/chat-data-access';
import { ActivityService } from '@okr/activity-data-access';
import { Router } from '@angular/router';

export type ReservationState = {
  listId: string;       // filter format: t_resourceType, r_resourceKey, p_reserverKey, or 'all'
  showOnlyCurrent: boolean;
  reserverId: string | undefined; // current reserver -> if reservations are filtered by this reserver
  reserverModelType: 'person' | 'org'; // model type of the reserver (if reservations are reserver-restricted)
  resourceId: string | undefined;   // id of the current resource -> used when reservations are resource-restricted
  caleventId: string | undefined;
  
  // filters
  searchTerm: string;
  selectedTag: string;
  selectedReason: string;
  selectedYear: number;
  selectedState: string;
};

const initialState: ReservationState = {
  listId: 'all',
  showOnlyCurrent: true,
  reserverId: undefined,
  reserverModelType: 'person',
  resourceId: undefined,
  caleventId: undefined,

  // filters
  searchTerm: '',
  selectedTag: '',
  selectedReason: 'all',
  selectedYear: getYear(), // initialize to current year to match ListFilter default
  selectedState: 'all'
};

export const ReservationStore = signalStore(
  withState(initialState),
  withProps(() => ({
    appStore: inject(AppStore),
    firestoreService: inject(FirestoreService),
    reservationService: inject(ReservationService),
    alertController: inject(AlertController),
    modalController: inject(ModalController),
    i18nService: inject(I18nService),
    // Lazy: a static import of @okr/chat-data-access is the edge that dragged matrix-js-sdk
    // (198 KB transfer) before the dashboard's LCP (spec 1.49, F1). Same accessor as the cms
    // section stores.
    matrixService: ((injector: Injector) => {
      let p: Promise<MatrixChatService> | undefined;
      return () => (p ??= import('@okr/chat-data-access')
        .then(m => injector.get(m.MatrixChatService))
        // A failed chunk load must not poison the cache: drop it so the next call retries.
        .catch(e => { p = undefined; throw e; }));
    })(inject(Injector)),
    activityService: inject(ActivityService),
    personService: inject(PersonService),
    toastController: inject(ToastController),
    personEditModalClass: inject(PERSON_EDIT_MODAL, { optional: true }),
    router: inject(Router)
  })),
  withProps((store) => ({
    i18n: store.i18nService.translateAll(RESERVATION_I18N_KEYS) as ReservationI18n,

    allReservationsResource: rxResource({
      params: () => ({
        currentUser: store.appStore.currentUser()
      }),
      stream: ({params}) => {
        return store.reservationService.list().pipe(
          debugListLoaded('ReservationStore.allReservations', params.currentUser)
        );
      }
    }),
    currentResourceResource: rxResource({
      params: () => ({
        resourceId: store.resourceId(),
        currentUser: store.appStore.currentUser()
      }),
      stream: ({ params }) => {
        const allResources$ = store.firestoreService.searchData<ResourceModel>(ResourceCollection, getSystemQuery(store.appStore.tenantId()), 'name', 'asc');
        return findByKey<ResourceModel>(allResources$, params.resourceId).pipe(
          debugItemLoaded('ReservationStore.resource', params.currentUser)
        );
      }
    }),
    currentReserverResource: rxResource({
      params: () => ({
        reserverId: store.reserverId(),
        reserverModelType: store.reserverModelType(),
        currentUser: store.appStore.currentUser()
      }),
      stream: ({ params }) => {
        if (!params.reserverId || !params.reserverId.length) return of(undefined);
        const collection = params.reserverModelType === 'person' ? 'persons' : 'orgs';
        return store.firestoreService.readModel<PersonModel | OrgModel>(collection, params.reserverId).pipe(
          take(1),
          debugItemLoaded('ReservationStore.reserver', params.currentUser)
        );
      }
    }),
    caleventResource: rxResource({
      params: () => ({
        caleventId: store.caleventId(),
        currentUser: store.appStore.currentUser()
      }),
      stream: ({ params }) => {
        if (!params.caleventId || !params.caleventId.length) return of(undefined);
        return store.firestoreService.readModel<CalEventModel>(CalEventCollection, params.caleventId).pipe(
          take(1),
          debugItemLoaded('ReservationStore.caleventResource', params.currentUser)
        );
      }
    })
  })),

  withComputed((state) => {
    return {
      allReservations: computed(() => state.allReservationsResource.value() ?? []),
      currentReservations: computed(() => state.allReservationsResource.value()?.filter(m => isValidAt(m.startDate, m.endDate)) ?? []),
      reservations: computed(() => state.showOnlyCurrent() ? state.allReservationsResource.value() ?? [] : state.allReservationsResource.value()?.filter(m => isValidAt(m.startDate, m.endDate)) ?? []),
      currentReserver: computed(() => state.currentReserverResource.value()),
      currentResource: computed(() => state.currentResourceResource.value()),
      calevent: computed(() => state.caleventResource.value() ?? undefined),

      // defaults if we do not have reserver or resource set explicitly
      currentUser: computed(() => state.appStore.currentUser()),
      currentPerson: computed(() => state.appStore.currentPerson()),
      defaultResource: computed(() => state.appStore.defaultResource()),
      genders: computed(() => state.appStore.getCategory('gender')),

      isLoading: computed(() => state.allReservationsResource.isLoading() || state.currentResourceResource.isLoading() || state.caleventResource.isLoading()),
      tenantId: computed(() => state.appStore.tenantId()),
      imgixBaseUrl: computed(() => state.appStore.env.services.imgixBaseUrl),
    }
  }),

    withComputed((state) => {
      return {
        filteredReservations: computed(() => {
          const allReservations = state.reservations() ?? [];
          
          // Apply listId filter first
          let filtered = allReservations;
          const listId = state.listId();
          
          if (listId && listId !== 'all') {
            const prefix = listId.substring(0,2);
            const value = listId.substring(2);
            
            switch (prefix) {
            case 't_': // resource type
              filtered = filtered.filter(r => r.resource?.type === value);
              break;
            case 'r_': // resource key
              filtered = filtered.filter(r => r.resource?.key === value);
              filtered = filtered.filter(r => r.resource?.key === value);
              break;
            case 'p_': // reserver key (person)
              filtered = filtered.filter(r => r.reserver?.key === value);
              break;
            case 'o_': // reserver key (org)
              filtered = filtered.filter(r => r.reserver?.key === value);
              break;
            default:
              console.warn(`ReservationStore: unknown listId prefix '${prefix}' in listId '${listId}'`);
              return allReservations;
            }
          }
          
          // Apply other filters
          return filtered.filter((reservation: ReservationModel) =>
            nameMatches(reservation.index, state.searchTerm()) &&
            yearMatches(reservation.startDate, state.selectedYear()) &&
            nameMatches(reservation.reason, state.selectedReason()) &&
            nameMatches(reservation.state, state.selectedState()) &&
            chipMatches(reservation.tags, state.selectedTag()))
        }),
      }
    }),

  withMethods((store) => {
    return {
      reload() {
        store.allReservationsResource.reload();
        store.currentReserverResource.reload();
        store.currentResourceResource.reload();
        store.caleventResource.reload();
      },

      /******************************** setters (filter) ******************************************* */
      setListId(listId: string) {
        if (listId === 'my') {
          const currentUser = store.appStore.currentUser();
          if (currentUser && currentUser.personKey) {
            const id = 'p_' + currentUser.personKey;
            patchState(store, { listId: id });
          }
        } else {
          patchState(store, { listId });
        }

        if (listId && listId !== 'all') {
          const prefix = listId.substring(0,2);
          const value = listId.substring(2);
          
          switch (prefix) {
            case 'r_': // resource key */
              patchState(store, { resourceId: value, reserverId: undefined });
              break;
            case 'p_': // reserver key (person) */
              patchState(store, { reserverId: value, reserverModelType: 'person', resourceId: undefined });
              break;
            case 'o_': // reserver key (org) */
              patchState(store, { reserverId: value, reserverModelType: 'org', resourceId: undefined });
              break;
          }
          this.reload();
        }
      },

      setReserverId(reserverId: string | undefined, reserverModelType: 'person' | 'org') {
        patchState(store, { reserverId, reserverModelType, resourceId: undefined });
        this.reload();
      },

      setResourceId(resourceId: string | undefined) {
        patchState(store, { resourceId, reserverId: undefined });
        this.reload();
      },

      setShowMode(showOnlyCurrent: boolean) {
        patchState(store, { showOnlyCurrent });
      },

      // filters
      setSearchTerm(searchTerm: string) {
        patchState(store, { searchTerm });
      },

      setSelectedTag(selectedTag: string) {
        patchState(store, { selectedTag });
      },

      setSelectedReason(selectedReason: string) {
        patchState(store, { selectedReason });
      },

      setSelectedYear(selectedYear: number) {
        patchState(store, { selectedYear });
      },

      setSelectedState(selectedState: string) {
        patchState(store, { selectedState });
      },

      /******************************** getters ******************************************* */
      getTags(): string {
        return store.appStore.getTags('reservation');
      },

      getReasons(): CategoryListModel {
        return store.appStore.getCategory('reservation_reason');
      },

      getStates(): CategoryListModel {
        return store.appStore.getCategory('reservation_state');
      },

      getStateIcon(state: string): string {
        return getCategoryIcon(this.getStates(), state);
      },

      getPeriodicities(): CategoryListModel {
        return store.appStore.getCategory('periodicity');
      },

      getResourceTypes(): CategoryListModel {
        return store.appStore.getCategory('resource_type');
      },

      getRboatTypes(): CategoryListModel {
        return store.appStore.getCategory('rboat_type');
      },

      getResource(resourceKey: string): ResourceModel | undefined {
        return store.appStore.getResource(resourceKey);
      },

      getLocale(): string {
        return store.appStore.appConfig().locale;
      },

      getPhone(reservation: ReservationModel): string | undefined {
        if (!reservation.reserver?.key) return undefined;
        return store.appStore.getDirectoryEntry(`person.${reservation.reserver.key}`)?.favPhone || undefined;
      },

      /******************************** actions ******************************************* */
      async add(readOnly = true): Promise<void> {
        if (readOnly) return;
        const newReservation = new ReservationModel(store.appStore.tenantId());
        // use either reserver (person/org) or resource from the store to prefill the new reservation or use currentPerson and defaultResource
        const reserver = store.currentReserver() ?? store.currentPerson();
        const reserverModelType = store.currentReserver() ? store.reserverModelType() : 'person';
        const resource = store.currentResource() ?? store.defaultResource();
        if (reserver && resource) {
          newReservation.reserver = getAvatarInfo(reserver, reserverModelType);
          newReservation.resource = getAvatarInfo(resource, 'resource');
          await this.edit(newReservation, readOnly, true);
        }
      },

      async edit(reservation: ReservationModel, readOnly = true, isSelectable = false): Promise<void> {
        const { ReservationEditModal } = await import('./reservation-edit.modal');
        const modal = await store.modalController.create({
          component: ReservationEditModal,
          componentProps: {
            reservation,
            currentUser: store.currentUser(),
            tags: this.getTags(),
            reasons: this.getReasons(),
            states: this.getStates(),
            periodicities: this.getPeriodicities(),
            locale: this.getLocale(),
            isSelectable,
            readOnly
          }
        });
        modal.present();
        const { data, role } = await modal.onDidDismiss();
        if (role === 'confirm' && data && !readOnly) {
          if (isReservation(data, store.tenantId())) {
            await (!data.okey ? 
              store.reservationService.create(data, store.currentUser()) : 
              store.reservationService.update(data, store.currentUser()));
            this.reload();
          }
        }
      },

      async end(reservation?: ReservationModel, readOnly = true): Promise<void> {
        if (reservation && !readOnly) {
          const date = await selectDate(store.modalController);
          if (!date) return;
          const endDate = convertDateFormatToString(date, DateFormat.IsoDate, DateFormat.StoreDate, false);
          await store.reservationService.endReservationByDate(reservation, endDate, store.appStore.currentUser());
          this.reload();
        }
      },

      /**
       * Cancel a reservation by setting its state to 'cancelled'. The record is kept for history.
       * Used by a reserver to cancel their own still-open reservation (see isReservationOpen).
       */
      async cancelReservation(reservation?: ReservationModel): Promise<void> {
        if (!reservation) return;
        const result = await confirm(store.alertController, store.i18n.cancelRes_confirm(), store.i18n.ok(), store.i18n.cancel(), true);
        if (result === true) {
          const cancelled = { ...reservation, state: 'cancelled' } as ReservationModel;
          await store.reservationService.update(cancelled, store.appStore.currentUser());
          this.reload();
        }
      },

      async delete(reservation?: ReservationModel, readOnly = true): Promise<void> {
        if (reservation && !readOnly) {
          const result = await confirm(store.alertController, store.i18n.delete_confirm(), store.i18n.ok(), store.i18n.cancel(), true);
          if (result === true) {
            await store.reservationService.delete(reservation, store.appStore.currentUser());
            this.reload();
          }
        }
      },

      async editPerson(reservation?: ReservationModel, readOnly = true): Promise<void> {
        if (!reservation || !reservation.reserver?.key || readOnly) return;
        const person = store.appStore.getPerson(reservation.reserver.key);
        if (!person || !store.personEditModalClass) return;
        const modal = await store.modalController.create({
          component: store.personEditModalClass,
          componentProps: {
            person,
            currentUser: store.currentUser(),
            tags: store.appStore.getTags(PersonModelName),
            tenantId: store.tenantId(),
            genders: store.genders(),
            readOnly
          }
        });
        modal.present();
        const { data, role } = await modal.onDidDismiss();
        if (role === 'confirm' && data && !readOnly) {
          await store.personService.update(data, store.currentUser());
        }
      },

      async callPhone(reservation?: ReservationModel, readOnly = true): Promise<void> {
        if (!reservation || readOnly) return;
        const phone = this.getPhone(reservation);
        if (phone) {
          return await browseUrl(`tel:${phone}`, '');
        }
      },

      async openDirectChat(reservation?: ReservationModel, readOnly = true): Promise<void> {
        if (!reservation || !reservation.reserver?.key || readOnly) return;
        const key = reservation.reserver.key;
        try {
          // Matrix is initialized in the background after login (MatrixInitializationService).
          // Await the idempotent, promise-cached init so opening a direct chat works even
          // before the user has visited the chat overview (which otherwise primes the client).
          const matrix = await store.matrixService();
          await matrix.ensureInitialized();
          const room = await matrix.createDirectRoom(key);
          void store.activityService.log('chat', 'createdirect', store.currentUser(), `SUCCESS: ${key}`);
          await navigateByUrl(store.router, '/private/chat/c-contentpage', { selectedRoom: room.roomId });
        } catch (error) {
          const msg = error instanceof Error ? error.message : 'Could not start chat';
          void store.activityService.log('chat', 'createdirect', store.currentUser(), `ERROR: ${key} ${msg}`);
          await showToast(store.toastController, msg);
        }
      },

      /**
       * Export the currently filtered reservations as a CSV file.
       * @param type the export flavour; only 'raw' exists today (menuItem `reservation-exportraw`)
       */
      async export(type: string): Promise<void> {
        if (type !== 'raw') {
          console.warn(`ReservationStore.export: type ${type} is not supported.`);
          return;
        }
        const reservations = store.filteredReservations() ?? [];
        if (reservations.length === 0) {
          showToast(store.toastController, store.i18n.export_empty());
          return;
        }
        // Category item labels are i18n keys, so they must be resolved before the (synchronous)
        // cell accessors run — see I18nService.createLabelResolver.
        const [state, reason] = await Promise.all([
          store.i18nService.createLabelResolver(store.appStore.getCategory('reservation_state')),
          store.i18nService.createLabelResolver(store.appStore.getCategory('reservation_reason')),
        ]);
        // listId, not the route input: 'my' is rewritten to 'p_<personKey>' by setListId.
        const listId = store.listId();
        const columns = getReservationExportColumns(listId, store.i18n, { state, reason });
        await exportCsv(buildExportTable(reservations, columns), getExportFileName(getReservationExportFileName(listId), 'csv'));
        showToast(store.toastController, store.i18n.export_conf());
      },

      async selectCalevent(readOnly: boolean, periodicities: CategoryListModel, calevent?: CalEventModel): Promise<CalEventModel | undefined> {
        const modal = await store.modalController.create({
          component: CalEventEditModal,
          cssClass: 'wide-modal',
          componentProps: {
                calevent: calevent ?? new CalEventModel(store.tenantId()),
                currentUser: store.currentUser(),
                types: store.appStore.getCategory('calevent_type'),
                periodicities,
                tags: store.appStore.getTags('calevent'),
                tenantId: store.tenantId(),
                locale: store.appStore.appConfig().locale,
                readOnly
          }
        });
        modal.present();
        const { data, role } = await modal.onWillDismiss();
        if (role === 'confirm' && data) {
          if (isCalEvent(data, store.tenantId())) {
            return data;
          }
        }
        return undefined;
      },

      async selectResource(): Promise<ResourceModel | undefined> {
        const modal = await store.modalController.create({
          component: ResourceSelectModal,
          cssClass: 'list-modal',
          componentProps: {
            selectedTag: '',
            currentUser: store.currentUser()
          }
        });
        modal.present();
        const { data, role } = await modal.onWillDismiss();
        if (role === 'confirm' && data) {
          if (isResource(data, store.tenantId())) {
            return data;
          }
        }
        return undefined;
      },

      async selectPerson(): Promise<PersonModel | undefined> {
        const modal = await store.modalController.create({
          component: PersonSelectModal,
          cssClass: 'list-modal',
          componentProps: {
            selectedTag: '',
            currentUser: store.currentUser()
          }
        });
        modal.present();
        const { data: result, role } = await modal.onWillDismiss<PersonSelectResult>();
        const data = result?.kind === 'predefined' ? result.person : undefined;
        if (role === 'confirm' && data) {
          if (isPerson(data, store.tenantId())) {
            return data;
          }
        }
        return undefined;
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
      }
    }
  }),
);

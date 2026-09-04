import { computed, inject, Injector } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { ActionSheetController, ModalController } from '@ionic/angular/standalone';
import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';

import { AppStore, KioskStatus, KioskStatusService, LocationSelectResult, ModelSelectService } from '@okr/shared-feature';
import { I18nService } from '@okr/shared-i18n';
import { AvatarInfo, PersonModel, ReservationModel, TaskModel, TripModel, UserModel } from '@okr/shared-models';
import { AlertService } from '@okr/shared-util-angular';
import { fill, getAvatarInfoForCurrentUser, getFullName, getTodayStr, getYear, hasRole, isKioskOnly, nameMatches } from '@okr/shared-util-core';
import { yearMatches } from '@okr/shared-categories';
import { END_FUTURE_DATE_STR } from '@okr/shared-constants';

import { TaskService } from '@okr/task-data-access';
import { ResponsibilityService } from '@okr/relationship-responsibility-data-access';
import { ReservationService } from '@okr/relationship-reservation-data-access';
import { findActiveReservationForResource } from '@okr/relationship-reservation-util';
import { LocationService } from '@okr/location-data-access';

import { TripService } from '@okr/trip-data-access';
import { findOpenTripForBoat, getTripLabel, groupTripsByDay, matchesStateFilter, newTrip, TRIP_I18N_KEYS, TripReport } from '@okr/trip-util';


/** Name of the responsibility that owns the Logbuch — gets the bug reports and the support calls. */
const LOGBUCH_RESPONSIBILITY = 'Logbuch2';

const SUSPICIOUS_WINDOW_MS = 15 * 60 * 1000;
const SUSPICIOUS_TRIP_COUNT = 3;
const SUSPICIOUS_DISTANCE_KM = 100;
const SUSPICIOUS_SEAT_DIFF = 2;
const SUSPICIOUS_HOUR_EARLY = 5;
const SUSPICIOUS_HOUR_LATE = 23;

/** Matches Swiss-format dates with optional leading zeros and 2- or 4-digit year: d[d].[m]m.[yy]yy */
const SWISS_DATE_RE = /^(\d{1,2})\.(\d{1,2})\.(\d{2}|\d{4})$/;

/**
 * If the user enters a date in Swiss format (d[d].[m]m.[yy]yy, detected by the dots),
 * convert it to store-date format (yyyymmdd) so it matches the date stored in trip.index.
 * Any other search term (or a partially typed / invalid date) is returned unchanged.
 */
function normalizeTripSearchTerm(searchTerm: string): string {
  const match = SWISS_DATE_RE.exec(searchTerm.trim());
  if (!match) return searchTerm;
  const [, day, month, year] = match;
  const fullYear = year.length === 2 ? `20${year}` : year;
  return `${fullYear}${month.padStart(2, '0')}${day.padStart(2, '0')}`;
}

export type TripState = {
  searchTerm: string;
  selectedState: string;
  selectedYear: number;
  locationType: string;
  type: string; // trip type / list partition (a `trip_type` category value, driven by the list's listId)
};

const initialState: TripState = {
  searchTerm: '',
  selectedState: 'all',
  selectedYear: getYear(), // initialize to current year to match ListFilter default
  locationType: 'logbuch',
  type: 'logbuch'
};

export const TripStore = signalStore(
  withState(initialState),
  withProps(() => ({
    appStore: inject(AppStore),
    tripService: inject(TripService),
    taskService: inject(TaskService),
    locationService: inject(LocationService),
    modelSelectService: inject(ModelSelectService),
    kioskStatusService: inject(KioskStatusService),
    responsibilityService: inject(ResponsibilityService),
    modalController: inject(ModalController),
    actionSheetController: inject(ActionSheetController),
    alertService: inject(AlertService),
    i18nService: inject(I18nService),
    injector: inject(Injector),
    reservationService: inject(ReservationService),
  })),
  withProps(store => ({
    i18n: store.i18nService.translateAll(TRIP_I18N_KEYS),
  })),
  withProps(store => ({
    tripsResource: rxResource({
      params: () => ({ 
        tenantId: store.appStore.tenantId() 
      }),
      stream: () => store.tripService.list(),
    }),
    // Admin-only: the tenant's kiosk devices, so the context menu can lock/unlock them. `params`
    // returns undefined for everyone else, which keeps the resource idle — no query, no read.
    kiosksResource: rxResource({
      params: () => hasRole('admin', store.appStore.currentUser())
        ? { tenantId: store.appStore.tenantId() }
        : undefined,
      stream: ({ params }) => store.kioskStatusService.listKiosks(params.tenantId),
    }),
    locationsResource: rxResource({
      params: () => ({
        currentUser: store.appStore.currentUser(),
        type: store.locationType()
      }),
      stream: ({params}) => {
        return store.locationService.list(params.type, 'distance', 'asc');
      }
    }),
    reservationsResource: rxResource({
      params: () => ({
        tenantId: store.appStore.tenantId()
      }),
      stream: () => store.reservationService.list(),
    }),
  })),
  withComputed(store => ({
    currentUser: computed(() => store.appStore.currentUser()),
    tenantId: computed(() => store.appStore.tenantId()),
    imgixBaseUrl: computed(() => store.appStore.env.services.imgixBaseUrl),
    isLoading: computed(() => store.tripsResource.isLoading()),
    // `locked` is the remote read-only switch an admin flips from the AOC kiosk screen; it is
    // always false for a non-kiosk user, so gating everyone on it here is safe.
    canWrite: computed(() =>
      !store.kioskStatusService.locked() &&
      (hasRole('kiosk', store.appStore.currentUser()) || hasRole('admin', store.appStore.currentUser()))
    ),
    locked: computed(() => store.kioskStatusService.locked()),
    kiosks: computed<KioskStatus[]>(() => store.kiosksResource.value() ?? []),
    locations: computed(() => store.locationsResource.value() ?? []),
    trips: computed(() => store.tripsResource.value() ?? []),
    reservations: computed(() => store.reservationsResource.value() ?? []),
  })),
  withComputed(store => ({
    // Drives the label of the admin's toggle. "Locked" means EVERY device is locked — with one
    // still open the Logbuch is not actually closed, so the next press must lock, not unlock.
    logbuchLocked: computed(() =>
      store.kiosks().length > 0 && store.kiosks().every(kiosk => kiosk.locked === true)),
  })),
  withComputed(store => ({
    filteredTrips: computed(() => {
      const searchTerm = normalizeTripSearchTerm(store.searchTerm());
      const type = store.type();
      const selectedState = store.selectedState();
      return store.trips().filter((trip: TripModel) =>
        // legacy trips predate the `type` field — treat them as 'logbuch' (the original, sole type)
        (trip.type || 'logbuch') === type &&
        // soft-deleted trips stay out of the list unless explicitly asked for (AOC uses its own query);
        // 'cancelled' is the trip_state category item name for the model's 'deleted' state.
        (trip.state !== 'deleted' || selectedState === 'cancelled') &&
        nameMatches(trip.index, searchTerm) &&
        yearMatches(trip.startDate, store.selectedYear()) &&
        matchesStateFilter(trip.state, selectedState)
      )
    }),
  })),
  withComputed(store => ({
    groupedByDay: computed(() => groupTripsByDay(store.filteredTrips())),
  })),
  withMethods(store => ({

    /******************************** setters (filter) ******************************************* */
    setSearchTerm(searchTerm: string) {
      patchState(store, { searchTerm });
    },

    setSelectedState(selectedState: string) {
      patchState(store, { selectedState });
    },

    setSelectedYear(selectedYear: number) {
      patchState(store, { selectedYear });
    },

    /** Set the trip type / list partition (the list's listId, a `trip_type` category value). */
    setType(type: string) {
      patchState(store, { type });
    },

    /******************************* CRUD on single trip  *************************************** */

    async openTripModal(trip: TripModel, mode: 'add' | 'edit' | 'end'): Promise<void> {
      if (!store.canWrite()) return;
      const { TripEditModal } = await import('./trip-edit.modal');
      const modal = await store.modalController.create({
        component: TripEditModal,
        cssClass: 'wide-modal',
        componentProps: { 
          trip, 
          mode 
        },
      });
      await modal.present();
      await modal.onDidDismiss();
      store.tripsResource.reload();
    },

    async createTrip(): Promise<void> {
      if (!store.canWrite()) return;
      const trip = newTrip(store.tenantId(), store.type());
      await this.openTripModal(trip, 'add');
    },

    async editTrip(trip: TripModel): Promise<void> {
      await this.openTripModal(trip, 'edit');
    },

    async endTrip(trip: TripModel): Promise<void> {
      await this.openTripModal(trip, 'end');
    },

    /** Read-only, easy-to-read representation — open to every registered user, not just writers. */
    async viewTrip(trip: TripModel): Promise<void> {
      const { TripViewModal } = await import('./trip-view.modal');
      const modal = await store.modalController.create({
        component: TripViewModal,
        // no fixed-size class: the read-only view shrinks to its content (see $fixed-size-modals)
        componentProps: { trip },
      });
      await modal.present();
      await modal.onDidDismiss();
    },

    async deleteTrip(trip: TripModel): Promise<void> {
      if (!store.canWrite()) return;
      const confirmed = await store.alertService.confirm(store.i18n.delete_confirm(), true);
      if (!confirmed) return;

      const reason = store.i18n.delete_reason();
      await store.tripService.softDelete(trip, reason, undefined, store.currentUser());
      await this.notifyResponsibility('trip', fill(store.i18n.notify_deleted(), { name: trip.name }), reason, undefined, store.currentUser());
      store.tripsResource.reload();
    },

    async selectPersonAvatar(): Promise<AvatarInfo | undefined> {
      // logbuch: crew is normally current members, so offer those first (two-level lookup)
      return await store.modelSelectService.selectPersonAvatar(undefined, undefined, true, true);
    },

    async selectResourceAvatar(excludeTripKey = ''): Promise<AvatarInfo | undefined> {
      // Loops so a refused boat sends the user straight back to the picker: the booking
      // continues with another boat instead of being aborted (see the boat-reservation spec §3).
      for (;;) {
        // selectedTag is a raw tag name matched against resource.tags — never an i18n key
        const boat = await store.modelSelectService.selectResourceAvatar('okBoat', undefined, store.i18n.select_boat_title());
        if (!boat) return undefined;
        // a boat that is still out on an open trip cannot be taken out again
        if (findOpenTripForBoat(store.trips(), boat.key, excludeTripKey)) {
          await store.alertService.showToast(fill(store.i18n.select_boat_in_use(), { name: boat.name2 ?? boat.name1 }));
          return undefined;
        }
        // a boat locked for repair or reserved for another purpose is explained, then re-asked
        const reservation = findActiveReservationForResource(store.reservations(), boat.key);
        if (reservation) {
          await this.showBoatReserved(reservation);
          continue;
        }
        const subType = await this.resolveRigging(boat.subType);
        return subType === boat.subType ? boat : { ...boat, subType };
      }
    },

    /** Explains an active reservation and waits — the caller then re-opens the boat picker. */
    async showBoatReserved(reservation: ReservationModel): Promise<void> {
      const { BoatReservedInfoModal } = await import('./boat-reserved-info.modal');
      const modal = await store.modalController.create({
        component: BoatReservedInfoModal,
        componentProps: { reservation },
      });
      await modal.present();
      await modal.onDidDismiss();
    },

    /**
     * Boat picker for a damage / bug report: unlike selectResourceAvatar it neither rejects a boat
     * that is still out on an open trip (a damage is usually reported on exactly such a boat) nor
     * asks for the rigging — a report is about the boat, not about how it was rowed.
     */
    async selectBoatForReport(): Promise<AvatarInfo | undefined> {
      return await store.modelSelectService.selectResourceAvatar('okBoat', undefined, store.i18n.select_boat_title());
    },

    /**
     * A convertible boat (rboat_type 'b<seats>mx') can be rowed either sculled or swept, and the
     * boat document cannot say which — only the crew that takes it out can. Ask, and store the
     * decided rigging on the trip ('b2mx' -> 'b2x' | 'b2m') so later statistics can group by it.
     * Every other type already carries its rigging and passes through untouched.
     */
    async resolveRigging(subType: string): Promise<string> {
      const match = /^b(\d+)mx$/.exec(subType ?? '');
      if (!match) return subType;
      const seats = match[1];
      const sheet = await store.actionSheetController.create({
        header: store.i18n.rigging_title(),
        // no cancel and no backdrop dismiss: the trip needs one of the two answers
        backdropDismiss: false,
        buttons: [
          { text: store.i18n.rigging_scull(), data: { rigging: 'x' } },
          { text: store.i18n.rigging_sweep(), data: { rigging: 'm' } },
        ],
      });
      await sheet.present();
      const { data } = await sheet.onDidDismiss();
      return data?.rigging ? `b${seats}${data.rigging}` : subType;
    },

    async selectLocationForTrip(): Promise<LocationSelectResult | undefined> {
      return await store.modelSelectService.selectLocation('logbuch', true, true);
    },

    /******************************* security *************************************** */
    checkSuspiciousActivity(trip: TripModel): string[] {
      const reasons: string[] = [];
      const now = Date.now();
      const recentTrips = (store.tripsResource.value() ?? []).filter(t => {
        if (!t.startDate || !t.startTime) return false;
        const dateStr = t.startDate;
        // startTime may be 'HH:mm' (getCurrentTime) or legacy 'HHmm'; strip non-digits.
        const timeStr = t.startTime.replace(/\D/g, '').padStart(4, '0');
        const tripMs = new Date(
          `${dateStr.substring(0, 4)}-${dateStr.substring(4, 6)}-${dateStr.substring(6, 8)}T${timeStr.substring(0, 2)}:${timeStr.substring(2, 4)}:00`
        ).getTime();
        return now - tripMs < SUSPICIOUS_WINDOW_MS;
      });
      if (recentTrips.length > SUSPICIOUS_TRIP_COUNT) reasons.push('multiple_trips');
      if (trip.distance > SUSPICIOUS_DISTANCE_KM) reasons.push('unusual_distance');
      const seats = (trip.resource as any)?.seats;
      if (seats !== undefined && Math.abs(trip.participants.length - seats) >= SUSPICIOUS_SEAT_DIFF) {
        reasons.push('seat_mismatch');
      }
      const hour = new Date().getHours();
      if (hour < SUSPICIOUS_HOUR_EARLY || hour >= SUSPICIOUS_HOUR_LATE) reasons.push('unusual_hours');
      return reasons;
    },

   async recordSuspiciousActivity(trip: TripModel, reasons: string[]): Promise<void> {
      const confirmed = await store.alertService.confirm(store.i18n.warning_suspicious(), true);
      if (!confirmed) return;

      const updatedTrip = { ...trip, flagged: true };
      await store.tripService.update(updatedTrip as TripModel, store.currentUser());
      await this.notifyResponsibility(
        'trip',
        fill(store.i18n.notify_suspicious(), { name: trip.name, reasons: reasons.join(', ') }),
        reasons.join(', '),
        undefined,
        store.currentUser(),
      );
      store.tripsResource.reload();
    },

    /******************************* other actions *************************************** */

    /**
     * Ask for boat, reporter and description. The boat is prefilled from the trip the report was
     * started on; the reporter is prefilled with the current user unless this is the kiosk, where
     * the account is shared and only the person standing there knows who is reporting.
     */
    async openReportModal(reportType: 'damage' | 'bug', currentUser?: UserModel, trip?: TripModel): Promise<TripReport | undefined> {
      const { TripReportModal } = await import('./trip-report.modal');
      const modal = await store.modalController.create({
        component: TripReportModal,
        componentProps: {
          reportType,
          boat: trip?.resource,
          person: currentUser && !isKioskOnly(currentUser) ? getAvatarInfoForCurrentUser(currentUser) : undefined,
        },
      });
      await modal.present();
      const { data, role } = await modal.onDidDismiss();
      return role === 'confirm' ? data as TripReport : undefined;
    },

    async reportDamage(currentUser?: UserModel, trip?: TripModel): Promise<void> {
      await this.report('damage', currentUser, trip);
    },

    async reportBug(currentUser?: UserModel, trip?: TripModel): Promise<void> {
      await this.report('bug', currentUser, trip);
    },

    /**
     * Collect the report and hand it to the `reportIncident` callable, which emits
     * 'trip.damageReported' / 'trip.bugReported'. WHO gets told, and how, is a workflow rule
     * — this store no longer looks up a responsibility by name and no longer writes the task.
     */
    async report(kind: 'damage' | 'bug', currentUser?: UserModel, trip?: TripModel): Promise<void> {
      const report = await this.openReportModal(kind, currentUser, trip);
      if (!report) return;
      try {
        await store.tripService.reportIncidentViaFunction({
          tenantId: store.tenantId(),
          kind,
          message: report.message,
          personKey: report.person?.key ?? '',
          personName: getFullName(report.person?.name1, report.person?.name2),
          boatKey: report.boat?.key ?? '',
          boatName: report.boat?.name2 || report.boat?.name1 || '',
          tripKey: trip?.okey ?? '',
          tripName: getTripLabel(trip),
        });
        await store.alertService.showToast(store.i18n.report_conf());
      } catch (error) {
        // the report is gone if this throws — say so instead of pretending it was filed
        await store.alertService.showToast(store.i18n.report_error());
        console.error('TripStore.report: reportIncident failed', error);
        return;
      }
      if (kind === 'damage' && report.lockBoat && report.boat) {
        await this.lockBoat(report.boat, report.person, report.message);
      }
    },

    /**
     * Take a boat out of service: an open-ended 'maintenance' reservation carrying the damage text
     * as its note. Open-ended means endDate = END_FUTURE_DATE_STR — a resourceAdmin ends or deletes
     * it once the boat is repaired. Any user may do this (a narrow, fixed-shape path); freely
     * editing reservations stays resourceAdmin-only in the reservation list.
     */
    async lockBoat(boat: AvatarInfo, reporter: AvatarInfo | undefined, message: string): Promise<void> {
      const reservation = new ReservationModel(store.tenantId());
      reservation.name = fill(store.i18n.report_lock_name(), { name: boat.name2 || boat.name1 });
      reservation.reserver = reporter;
      reservation.resource = boat;
      reservation.reason = 'maintenance';
      reservation.notes = message;
      reservation.state = 'active';
      reservation.fullDay = true;
      reservation.durationMinutes = 1440;
      reservation.startDate = getTodayStr();
      reservation.startTime = '';
      reservation.endDate = END_FUTURE_DATE_STR;
      try {
        await store.reservationService.create(reservation, store.currentUser());
        store.reservationsResource.reload();
      } catch (error) {
        // the report itself is already filed — say only the lock failed
        await store.alertService.showToast(store.i18n.report_lock_error());
        console.error('TripStore.lockBoat: could not create the lock reservation', error);
      }
    },

    async notifyResponsibility(
      responsibilityName: string,
      taskName: string,
      notes: string,
      photoUrl: string | undefined,
      currentUser: UserModel | undefined,
    ): Promise<void> {
      const responsibilities = await store.responsibilityService.listOnce();
      const responsibility = responsibilities.find(r => r.name === responsibilityName);
      if (!responsibility?.responsibleAvatar) return;

      const task = new TaskModel(store.tenantId());
      task.name = taskName;
      task.assignee = responsibility.responsibleAvatar;
      task.author = currentUser ? getAvatarInfoForCurrentUser(currentUser) : undefined;
      task.notes = photoUrl ? `${notes}\nFoto: ${photoUrl}` : notes;
      task.tags = responsibilityName;
      await store.taskService.create(task, currentUser);
    },

    /**
     * Place a video call to whoever is responsible for the Logbuch.
     *
     * matrix-js-sdk is ~700KB, so the chat data-access lib is pulled in dynamically — the
     * trips bundle stays free of it and only a kiosk that actually calls support loads it.
     */
    async callSupport(): Promise<void> {
      const responsibilities = await store.responsibilityService.listOnce();
      const responsible = responsibilities.find(r => r.name === LOGBUCH_RESPONSIBILITY)?.responsibleAvatar;
      // a group is a valid responsible party for tasks, but there is nobody to ring
      if (!responsible?.key || responsible.modelType !== 'person') {
        await store.alertService.showToast(store.i18n.call_support_none());
        return;
      }
      try {
        const { MatrixChatService } = await import('@okr/chat-data-access');
        const matrixService = store.injector.get(MatrixChatService);
        await matrixService.ensureInitialized();
        const room = await matrixService.createDirectRoom(responsible.key);
        await matrixService.startVideoCall(room.roomId, store.currentUser());
      } catch (error) {
        console.error('TripStore.callSupport: failed to start the support call:', error);
        await store.alertService.showToast(store.i18n.call_support_error());
      }
    },

    async export(type: string): Promise<void> {
      console.log(`IconStore.export(${type}) is not yet implemented.`);
    },

    async showBoatStatistics(): Promise<void> {
      await this.openStatsModal('boat');
    },

    async showPersonStatistics(): Promise<void> {
      await this.openStatsModal('member');
    },

    async openStatsModal(contentType: 'boat' | 'member'): Promise<void> {
      const { TripStatsModal } = await import('./trip-stats.modal');
      const modal = await store.modalController.create({
        component: TripStatsModal,
        cssClass: 'wide-modal',
        componentProps: { contentType },
      });
      await modal.present();
      await modal.onDidDismiss();
    },

    /**
     * The admin's remote read-only switch for the whole Logbuch, reachable from the trips context
     * menu. It writes `locked` to EVERY kiosk-status document of the tenant — the lock lives per
     * device, so "lock the Logbuch" means "lock every device that can write to it".
     *
     * The admin's own app is not affected: KioskStatusService only listens for kiosk-only users,
     * so `locked()` stays false here and an admin keeps full access while the boathouse is closed.
     */
    async toggleLogbuchLock(): Promise<void> {
      const kiosks = store.kiosks();
      if (kiosks.length === 0) {
        await store.alertService.showToast(store.i18n.lock_none());
        return;
      }
      const locked = !store.logbuchLocked();
      const confirmed = await store.alertService.confirm(
        locked ? store.i18n.lock_confirm() : store.i18n.unlock_confirm(), true
      );
      if (!confirmed) return;

      const ok = await store.kioskStatusService.setLock(kiosks, locked);
      await store.alertService.showToast(
        !ok ? store.i18n.lock_error() : locked ? store.i18n.lock_conf() : store.i18n.unlock_conf()
      );
      store.kiosksResource.reload();
    },

    async showInfo(): Promise<void> {
      const { TripInfoModal } = await import('./trip-info.modal');
      const modal = await store.modalController.create({
        component: TripInfoModal,
      });
      await modal.present();
      await modal.onDidDismiss();
    },
  }))
);

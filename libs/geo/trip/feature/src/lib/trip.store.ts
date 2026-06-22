import { computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { ActionSheetController, ModalController, Platform } from '@ionic/angular/standalone';
import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';
import { firstValueFrom } from 'rxjs';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { Capacitor } from '@capacitor/core';

import { AppStore, LocationSelectResult, ModelSelectService } from '@bk2/shared-feature';
import { I18nService } from '@bk2/shared-i18n';
import { AvatarInfo, PersonModel, TaskModel, TripModel, UserModel } from '@bk2/shared-models';
import { AlertService } from '@bk2/shared-util-angular';
import { getAvatarInfoForCurrentUser, getFullName, getYear, hasRole, nameMatches } from '@bk2/shared-util-core';
import { yearMatches } from '@bk2/shared-categories';

import { TaskService } from '@bk2/task-data-access';
import { ResponsibilityService } from '@bk2/relationship-responsibility-data-access';
import { UploadService } from '@bk2/avatar-data-access';
import { readAsFile } from '@bk2/avatar-util';
import { LocationService } from '@bk2/location-data-access';

import { TripService } from '@bk2/trip-data-access';
import { groupTripsByDay, newTrip, TRIP_I18N_KEYS } from '@bk2/trip-util';


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
};

const initialState: TripState = {
  searchTerm: '',
  selectedState: 'all',
  selectedYear: getYear(), // initialize to current year to match ListFilter default
  locationType: 'logbuch'
};

export const TripStore = signalStore(
  withState(initialState),
  withProps(() => ({
    appStore: inject(AppStore),
    tripService: inject(TripService),
    taskService: inject(TaskService),
    locationService: inject(LocationService),
    modelSelectService: inject(ModelSelectService),
    responsibilityService: inject(ResponsibilityService),
    uploadService: inject(UploadService),
    modalController: inject(ModalController),
    actionSheetController: inject(ActionSheetController),
    alertService: inject(AlertService),
    platform: inject(Platform),
    i18nService: inject(I18nService),
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
    locationsResource: rxResource({
      params: () => ({
        currentUser: store.appStore.currentUser(),
        type: store.locationType()
      }),
      stream: ({params}) => {
        return store.locationService.list(params.type, 'distance', 'asc');
      }
    })
  })),
  withComputed(store => ({
    currentUser: computed(() => store.appStore.currentUser()),
    tenantId: computed(() => store.appStore.tenantId()),
    imgixBaseUrl: computed(() => store.appStore.env.services.imgixBaseUrl),
    isLoading: computed(() => store.tripsResource.isLoading()),
    canWrite: computed(() =>
      hasRole('kiosk', store.appStore.currentUser()) || hasRole('admin', store.appStore.currentUser())
    ),
    locations: computed(() => store.locationsResource.value() ?? []),
    trips: computed(() => store.tripsResource.value() ?? [])
  })),
  withComputed(store => ({
    filteredTrips: computed(() => {
      const searchTerm = normalizeTripSearchTerm(store.searchTerm());
      return store.trips().filter((trip: TripModel) =>
        nameMatches(trip.index, searchTerm) &&
        yearMatches(trip.startDate, store.selectedYear()) &&
        nameMatches(trip.state, store.selectedState())
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

    /******************************* CRUD on single trip  *************************************** */

    async openTripModal(trip: TripModel, mode: 'add' | 'edit' | 'end' | 'view'): Promise<void> {
      if (mode !== 'view' && !store.canWrite()) return;
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
      const trip = newTrip(store.tenantId());
      await this.openTripModal(trip, 'add');
    },

    async editTrip(trip: TripModel): Promise<void> {
      await this.openTripModal(trip, 'edit');
    },

    async endTrip(trip: TripModel): Promise<void> {
      await this.openTripModal(trip, 'end');
    },

    async viewTrip(trip: TripModel): Promise<void> {
      await this.openTripModal(trip, 'view');
    },

    async deleteTrip(trip: TripModel): Promise<void> {
      if (!store.canWrite()) return;
      const confirmed = await store.alertService.confirm(store.i18n.delete_confirm(), true);
      if (!confirmed) return;

      let photoUrl: string | undefined;
      try {
        const photo = await Camera.getPhoto({
          quality: 80,
          allowEditing: false,
          resultType: CameraResultType.Uri,
          source: Capacitor.isNativePlatform() ? CameraSource.Prompt : CameraSource.Photos,
        });
        const file = await readAsFile(photo, store.platform);
        if (file) {
          const fullPath = `${store.tenantId()}/trips/${trip.bkey}/images/delete_${Date.now()}.jpg`;
          photoUrl = await store.uploadService.uploadFile(file, fullPath, 'Löschfoto');
        }
      } catch {
        // photo capture is optional — proceed without it
      }

      const reason = store.i18n.delete_reason();
      await store.tripService.softDelete(trip, reason, photoUrl, store.currentUser());
      await this.notifyResponsibility('trip', `Trip gelöscht: ${trip.name}`, reason, photoUrl, store.currentUser());
      store.tripsResource.reload();
    },

    async selectPersonAvatar(): Promise<AvatarInfo | undefined> {
      return await store.modelSelectService.selectPersonAvatar(undefined, undefined, true);
    },

    async selectResourceAvatar(): Promise<AvatarInfo | undefined> {
      return await store.modelSelectService.selectResourceAvatar('@tag.okBoat', undefined, store.i18n.select_boat_title());
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
        const timeStr = t.startTime.padStart(4, '0');
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

      let photoUrl: string | undefined;
      try {
        const photo = await Camera.getPhoto({
          quality: 80,
          allowEditing: false,
          resultType: CameraResultType.Uri,
          source: Capacitor.isNativePlatform() ? CameraSource.Prompt : CameraSource.Photos,
        });
        const file = await readAsFile(photo, store.platform);
        if (file) {
          const fullPath = `${store.tenantId()}/trips/${trip.bkey}/images/flag_${Date.now()}.jpg`;
          photoUrl = await store.uploadService.uploadFile(file, fullPath, 'Verdacht-Foto');
        }
      } catch {
        // photo capture optional
      }

      const updatedTrip = { ...trip, flagged: true };
      await store.tripService.update(updatedTrip as TripModel, store.currentUser());
      await this.notifyResponsibility(
        'trip',
        `Verdächtige Aktivität: ${trip.name} (${reasons.join(', ')})`,
        reasons.join(', '),
        photoUrl,
        store.currentUser(),
      );
      store.tripsResource.reload();
    },

    /******************************* other actions *************************************** */
    async reportDamage(currentUser?: UserModel, trip?: TripModel): Promise<void> {
      const message = await store.alertService.bkPrompt(store.i18n.report_damage(), store.i18n.report_damage_prompt());
      if (message === undefined) return;
      const user = currentUser ? getFullName(currentUser.firstName, currentUser.lastName) : 'undefined';
      const taskName = trip ?
        `${user} ${store.i18n.report_damage_trip()} ${trip.name}` :
        `${user} ${store.i18n.report_damage_plain()}`;
      await this.notifyResponsibility('Ressort Boote', taskName, message, undefined, store.currentUser());
    },

    async reportBug(currentUser?: UserModel, trip?: TripModel): Promise<void> {
      const message = await store.alertService.bkPrompt(store.i18n.report_bug(), store.i18n.report_bug_prompt());
      if (message === undefined) return;
      const user = currentUser ? getFullName(currentUser.firstName, currentUser.lastName) : 'undefined';
      const taskName = trip ?
        `${user} ${store.i18n.report_bug_trip()} ${trip.name}` :
        `${user} ${store.i18n.report_bug_plain()}`;
      await this.notifyResponsibility('Logbuch2', taskName, message, undefined, store.currentUser());
    },

    async notifyResponsibility(
      responsibilityName: string,
      taskName: string,
      notes: string,
      photoUrl: string | undefined,
      currentUser: UserModel | undefined,
    ): Promise<void> {
      const responsibilities = await firstValueFrom(store.responsibilityService.list());
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
  }))
);

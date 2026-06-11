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
import { getFullName, getYear, hasRole, nameMatches } from '@bk2/shared-util-core';

import { TaskService } from '@bk2/task-data-access';
import { ResponsibilityService } from '@bk2/relationship-responsibility-data-access';
import { UploadService } from '@bk2/avatar-data-access';
import { readAsFile } from '@bk2/avatar-util';

import { TripService } from '@bk2/trip-data-access';
import { groupTripsByDay, newTrip, TRIP_I18N_KEYS, TripI18n } from '@bk2/trip-util';
import { LocationService } from '@bk2/location-data-access';
import { yearMatches } from '@bk2/shared-categories';
export type { TripI18n };


const SUSPICIOUS_WINDOW_MS = 15 * 60 * 1000;
const SUSPICIOUS_TRIP_COUNT = 3;
const SUSPICIOUS_DISTANCE_KM = 100;
const SUSPICIOUS_SEAT_DIFF = 2;
const SUSPICIOUS_HOUR_EARLY = 5;
const SUSPICIOUS_HOUR_LATE = 23;

export type TripState = {
  searchTerm: string;
  selectedState: string;
  selectedYear: number;
  locationType: string;
};

const initialState: TripState = {
  searchTerm: '',
  selectedState: 'open',
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
      return store.trips().filter((trip: TripModel) => 
        nameMatches(trip.index, store.searchTerm()) &&
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

    async openTripModal(trip: TripModel, mode: 'add' | 'edit' | 'end'): Promise<void> {
      if (!store.canWrite()) return;
      const { TripEditModal } = await import('./trip-edit.modal');
      const modal = await store.modalController.create({
        component: TripEditModal,
        componentProps: { trip, mode },
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
      return await store.modelSelectService.selectPersonAvatar();
    },

    async selectResourceAvatar(): Promise<AvatarInfo | undefined> {
      return await store.modelSelectService.selectResourceAvatar('@tag.okBoat');
    },

    async selectLocationAvatar(): Promise<AvatarInfo | undefined> {
      return await store.modelSelectService.selectLocationAvatar('logbuch');
    },

    async selectLocationForTrip(): Promise<LocationSelectResult | undefined> {
      return await store.modelSelectService.selectLocationResult('logbuch');
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
      const user = currentUser ? getFullName(currentUser.firstName, currentUser.lastName) : 'undefined';
      const msg = trip ? 
        `${user} ${store.i18n.report_damage_trip()} ${trip.name}` : 
        `${user} ${store.i18n.report_damage_plain()}: `;
      await this.notifyResponsibility('Ressort Boote', msg, '', undefined, store.currentUser());
    },

    async reportBug(currentUser?: UserModel, trip?: TripModel): Promise<void> {
        const user = currentUser ? getFullName(currentUser.firstName, currentUser.lastName) : 'undefined';
      const msg = trip ? 
        `${user} ${store.i18n.report_bug_trip()} ${trip.name}` : 
        `${user} ${store.i18n.report_bug_plain()}: `;
      await this.notifyResponsibility('Logbuch2', msg, '', undefined, store.currentUser());
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
      task.notes = photoUrl ? `${notes}\nFoto: ${photoUrl}` : notes;
      task.tags = responsibilityName;
      await store.taskService.create(task, currentUser);
    },

    async export(type: string): Promise<void> {
      console.log(`IconStore.export(${type}) is not yet implemented.`);
    },

    async showBoatStatistics(): Promise<void> {
      console.log(`IconStore.showBoatStatistics('showBoatStatistics is not yet implemented.`);
    },

    async showPersonStatistics(): Promise<void> {
      console.log(`IconStore.showPersonStatistics('showPersonStatistics is not yet implemented.`);
    },
  }))
);

import { computed, inject, Signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { ActionSheetController, ModalController, Platform } from '@ionic/angular/standalone';
import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';
import { firstValueFrom } from 'rxjs';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { Capacitor } from '@capacitor/core';

import { AppStore } from '@bk2/shared-feature';
import { I18nService } from '@bk2/shared-i18n';
import { TaskModel, TripModel, UserModel } from '@bk2/shared-models';
import { AlertService } from '@bk2/shared-util-angular';
import { hasRole } from '@bk2/shared-util-core';

import { TaskService } from '@bk2/task-data-access';
import { ResponsibilityService } from '@bk2/relationship-responsibility-data-access';
import { UploadService } from '@bk2/avatar-data-access';
import { readAsFile } from '@bk2/avatar-util';

import { TripService } from '@bk2/trip-data-access';
import { compareTripDate, groupTripsByDay, matchesStateFilter, newTrip } from '@bk2/trip-util';

import { TripEditModal } from './trip-edit.modal';
import { PFX } from './scope';

const TRIP_I18N_KEYS = {
  list_title:         PFX + 'list.title',
  empty:              PFX + 'empty',
  cancel:             PFX + 'cancel',
  delete_confirm:     PFX + 'delete.confirm',
  delete_reason:      PFX + 'delete.reason',
  delete_conf:        PFX + 'delete.conf',
  delete_error:       PFX + 'delete.error',
  add_title:          PFX + 'add.title',
  edit_title:         PFX + 'edit.title',
  end_title:          PFX + 'end.title',
  as_add:             PFX + 'actionsheet.add',
  as_edit:            PFX + 'actionsheet.edit',
  as_end:             PFX + 'actionsheet.end',
  as_delete:          PFX + 'actionsheet.delete',
  as_report_damage:   PFX + 'actionsheet.report_damage',
  as_report_bug:      PFX + 'actionsheet.report_bug',
  as_add_guest:       PFX + 'actionsheet.add_guest',
  as_show_images:     PFX + 'actionsheet.show_images',
  warning_suspicious: PFX + 'warning.suspicious',
} satisfies Record<string, string>;

export type TripI18n = { [K in keyof typeof TRIP_I18N_KEYS]: Signal<string> };

export type TripState = {
  searchTerm: string;
  stateFilter: string;
};

const initialState: TripState = {
  searchTerm: '',
  stateFilter: 'open',
};

export const TripStore = signalStore(
  withState(initialState),
  withProps(() => ({
    appStore: inject(AppStore),
    tripService: inject(TripService),
    taskService: inject(TaskService),
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
      params: () => ({ tenantId: store.appStore.tenantId() }),
      stream: () => store.tripService.list(),
    }),
  })),
  withComputed(store => ({
    currentUser: computed(() => store.appStore.currentUser()),
    tenantId: computed(() => store.appStore.tenantId()),
    isLoading: computed(() => store.tripsResource.isLoading()),
    canWrite: computed(() =>
      hasRole('kiosk', store.appStore.currentUser()) || hasRole('admin', store.appStore.currentUser())
    ),
    filteredTrips: computed(() => {
      const all = store.tripsResource.value() ?? [];
      const term = store.searchTerm().toLowerCase();
      const stateFilter = store.stateFilter();
      return all
        .filter(t => matchesStateFilter(t.state, stateFilter))
        .filter(t => !term || t.index.toLowerCase().includes(term))
        .sort(compareTripDate);
    }),
  })),
  withComputed(store => ({
    groupedByDay: computed(() => groupTripsByDay(store.filteredTrips())),
  })),
  withMethods(store => ({
    setSearchTerm(searchTerm: string) {
      patchState(store, { searchTerm });
    },

    setStateFilter(stateFilter: string) {
      patchState(store, { stateFilter });
    },

    async openTripModal(trip: TripModel, mode: 'add' | 'edit' | 'end'): Promise<void> {
      if (!store.canWrite()) return;
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

    async reportDamage(trip: TripModel): Promise<void> {
      await this.notifyResponsibility('trip', `Schaden gemeldet: ${trip.name}`, '', undefined, store.currentUser());
    },

    async reportBug(trip: TripModel): Promise<void> {
      await this.notifyResponsibility('dev', `Fehler gemeldet: ${trip.name}`, '', undefined, store.currentUser());
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
      task.tags = 'trip';
      await store.taskService.create(task, currentUser);
    },
  }))
);

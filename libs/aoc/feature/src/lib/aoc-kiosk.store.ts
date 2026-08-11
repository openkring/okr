import { computed, inject, Injector, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { signalStore, withComputed, withMethods, withProps } from '@ngrx/signals';
import { firstValueFrom } from 'rxjs';

import { KioskStatus, KioskStatusCollection, AppStore } from '@okr/shared-feature';
import { FirestoreService } from '@okr/shared-data-access';
import { TripModel } from '@okr/shared-models';
import { AlertService } from '@okr/shared-util-angular';
import { getTodayStr } from '@okr/shared-util-core';

import { UserService } from '@okr/user-data-access';
import { TripService } from '@okr/trip-data-access';

/**
 * Remote operations on the tenant's kiosk devices (see the `kiosk` skill).
 *
 * Every command is a plain field write on `kiosk-status/{uid}` — the device holds an open
 * `onSnapshot` on its own document and acts on what appears there (`KioskStatusService`). No
 * push channel, no Cloud Function: the device is already listening, and a kiosk that is off
 * simply picks the command up the next time it starts.
 */
export const AocKioskStore = signalStore(
  withProps(() => ({
    appStore: inject(AppStore),
    firestoreService: inject(FirestoreService),
    userService: inject(UserService),
    tripService: inject(TripService),
    alertService: inject(AlertService),
    injector: inject(Injector),
  })),
  withProps(store => ({
    kiosksResource: rxResource({
      params: () => ({ tenantId: store.appStore.tenantId() }),
      // NOT getSystemQuery(): that adds `isArchived == false`, and telemetry documents carry no
      // such field, so it would match nothing. orderBy 'none' keeps this off a composite index —
      // a tenant has one or two kiosks, so the sort below is free.
      stream: ({ params }) => store.firestoreService.searchData<KioskStatus>(
        KioskStatusCollection,
        [{ key: 'tenants', operator: 'array-contains', value: params.tenantId }],
        'none',
      ),
    }),
    tripsResource: rxResource({
      params: () => ({ tenantId: store.appStore.tenantId() }),
      stream: () => store.tripService.list(),
    }),
  })),
  withProps(() => ({
    /** Re-read on every action so the relative "seen" ages do not go stale while the screen is open. */
    now: signal(Date.now()),
  })),
  withComputed(store => ({
    isLoading: computed(() => store.kiosksResource.isLoading()),
    kiosks: computed(() =>
      [...(store.kiosksResource.value() ?? [])].sort((a, b) => (b.seen ?? '').localeCompare(a.seen ?? ''))
    ),
    /** Today's trips, newest first — the quickest "is the kiosk actually being used" check there is. */
    todaysTrips: computed(() => {
      const today = getTodayStr();
      return (store.tripsResource.value() ?? [])
        .filter((trip: TripModel) => trip.startDate === today && trip.state !== 'deleted')
        .sort((a, b) => (b.startTime ?? '').localeCompare(a.startTime ?? ''));
    }),
  })),
  withMethods(store => ({

    refresh(): void {
      store.now.set(Date.now());
      store.kiosksResource.reload();
      store.tripsResource.reload();
    },

    /** Reload the kiosk's browser page — the way to pull a freshly deployed version onto it. */
    async reloadKiosk(kiosk: KioskStatus): Promise<void> {
      const confirmed = await store.alertService.confirm(
        `${kiosk.device}: Gerät jetzt neu laden? Eine offene Eingabe geht dabei verloren.`, true
      );
      if (!confirmed) return;
      await this.sendCommand(kiosk, { reloadAt: new Date().toISOString() }, 'Neuladen ausgelöst.');
    },

    /** Pop a message on the kiosk screen (e.g. "Bitte Boot 3 nicht mehr benutzen"). */
    async sendAlert(kiosk: KioskStatus): Promise<void> {
      const message = await store.alertService.okrPrompt('Mitteilung senden', 'Text der Mitteilung');
      if (!message) return;
      await this.sendCommand(
        kiosk, { alertAt: new Date().toISOString(), alertMessage: message }, 'Mitteilung gesendet.'
      );
    },

    /** Read-only mode: the Logbuch stays visible, new and changed trips are refused. */
    async toggleLock(kiosk: KioskStatus): Promise<void> {
      const locked = kiosk.locked !== true;
      await this.sendCommand(kiosk, { locked }, locked ? 'Kiosk gesperrt.' : 'Kiosk entsperrt.');
    },

    async sendCommand(kiosk: KioskStatus, command: Partial<KioskStatus>, confirmMessage: string): Promise<void> {
      await store.firestoreService.updateObject(
        KioskStatusCollection, kiosk.uid, command, false, confirmMessage, store.appStore.currentUser()
      );
      store.now.set(Date.now());
    },

    /**
     * Place a video call to the device. The kiosk auto-answers into its floating call window
     * (`KioskCallWindow`, mounted for kiosk-only users), so nobody has to accept anything there.
     *
     * matrix-js-sdk is ~700KB — imported dynamically so the AOC bundle does not carry it.
     */
    async callKiosk(kiosk: KioskStatus): Promise<void> {
      const user = await firstValueFrom(store.userService.read(kiosk.uid));
      if (!user?.personKey) {
        await store.alertService.showToast('Zu diesem Kiosk ist keine Person hinterlegt — Anruf nicht möglich.');
        return;
      }
      try {
        const { MatrixChatService } = await import('@okr/chat-data-access');
        const matrixService = store.injector.get(MatrixChatService);
        await matrixService.ensureInitialized();
        const room = await matrixService.createDirectRoom(user.personKey);
        await matrixService.startVideoCall(room.roomId, store.appStore.currentUser());
      } catch (error) {
        console.error('AocKioskStore.callKiosk: failed to start the call:', error);
        await store.alertService.showToast('Der Anruf konnte nicht gestartet werden.');
      }
    },
  })),
);

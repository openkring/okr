import { inject } from '@angular/core';
import { AlertController, ToastController } from '@ionic/angular';
import { getApp } from 'firebase/app';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { patchState, signalStore, withMethods, withProps, withState } from '@ngrx/signals';
import { from } from 'rxjs';

import { FirestoreService } from '@okr/shared-data-access';
import { AppStore } from '@okr/shared-feature';
import { I18nService } from '@okr/shared-i18n';
import { AddressCollection, AddressModel, LogInfo } from '@okr/shared-models';
import { fill, getFullName, getSystemQuery } from '@okr/shared-util-core';
import { confirm, showToast } from '@okr/shared-util-angular';
import { AOC_I18N_KEYS } from '@okr/aoc-util';

export type AocAdminOpsState = {
  log: LogInfo[];
  logTitle: string;
};

export const initialState: AocAdminOpsState = {
  log: [],
  logTitle: '',
};
 
export const AocAdminOpsStore = signalStore(
  withState(initialState),
  withProps(() => ({
    appStore: inject(AppStore),
    firestoreService: inject(FirestoreService),
    alertController: inject(AlertController),
    toastController: inject(ToastController),
    i18n: inject(I18nService).translateAll(AOC_I18N_KEYS),
  })),
  withMethods(store => {
    return {
      /**
       * Einmalige Wartung: spiegelt aus `users`, in WELCHEN Mandanten eine Person einen Zugang
       * hat, auf `persons.accountTenants`.
       *
       * Warum es das Merkmal ueberhaupt gibt: eingeladen werden duerfen nur registrierte Benutzer,
       * aber `users/{uid}` ist fuer gewoehnliche Benutzer nicht lesbar — und einladen darf auch ein
       * Gruppen-Admin ohne `privileged`. Laufend haelt der Trigger `onUserWritten` das Merkmal
       * aktuell; diese Aktion holt den Bestand nach.
       *
       * Laeuft ueber ALLE Mandanten, auch wenn sie aus einem einzelnen aufgerufen wird: das Feld
       * listet die Mandanten mit Zugang, und aus nur einem berechnet wuerde es die uebrigen
       * loeschen und die Person dort un-einladbar machen.
       *
       * Idempotent: eine Person, deren Wert bereits stimmt, wird nicht geschrieben. Deshalb ist ein
       * mehrfacher Aufruf gefahrlos, und die Rueckmeldung zaehlt nur die echten Aenderungen.
       */
      async backfillAccountTenants(): Promise<void> {
        const confirmed = await confirm(store.alertController, store.i18n.adminops_hasaccount_confirm(),
          store.i18n.ok(), store.i18n.cancel(), true);
        if (!confirmed) return;
        try {
          const fn = httpsCallable<Record<string, never>, { users: number; persons: number; written: number }>(
            getFunctions(getApp(), 'europe-west6'), 'backfillAccountTenants');
          const result = await fn({});
          const { users, persons, written } = result.data;
          patchState(store, {
            logTitle: store.i18n.adminops_hasaccount_title(),
            log: [
              { id: 'users', name: 'users', message: `${users}` },
              { id: 'persons', name: 'persons', message: `${persons}` },
              { id: 'written', name: 'written', message: `${written}` },
            ],
          });
          await showToast(store.toastController,
            fill(store.i18n.adminops_hasaccount_conf(), { count: written }));
        } catch (e) {
          await showToast(store.toastController, `${store.i18n.error()}: ${(e as Error).message}`);
        }
      },

      async listIban(): Promise<void> {
        const query = getSystemQuery(store.appStore.env.tenantId);
        query.push({ key: 'addressChannel', operator: '==', value: 'bankaccount' });
        from(store.firestoreService.getDataOnce<AddressModel>(AddressCollection, query, 'none'))
        .subscribe((addresses) => {
          const log: LogInfo[] = [];
          addresses.forEach((address) => {
            const [modelType, pkey] = address.parentKey.split('.');
            let name = '';
            if (modelType === 'person') {
              const person = store.appStore.getPerson(pkey);
              name = getFullName(person?.firstName, person?.lastName);
            } else if (modelType === 'org') {
              const org = store.appStore.getOrg(pkey);
              name = org?.name || '';
            }
                log.push({ id: address.okey, name: name, message: address.iban });
          });
          patchState(store, { log, logTitle: 'IBAN List' });
        }); 
      },
    };
  })
);

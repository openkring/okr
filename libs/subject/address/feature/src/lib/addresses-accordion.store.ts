import { computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { AlertController, ModalController, ToastController } from '@ionic/angular/standalone';
import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';
import { of } from 'rxjs';

import { FirestoreService } from '@bk2/shared-data-access';
import { AppStore } from '@bk2/shared-feature';
import { AddressCollection, AddressModel, DefaultLanguage } from '@bk2/shared-models';
import { confirm } from '@bk2/shared-util-angular';
import { getSystemQuery } from '@bk2/shared-util-core';

import { AddressService } from '@bk2/subject-address-data-access';

import { browseUrl, copyAddress, isAddress } from '@bk2/subject-address-util';
import { AddressEditModalComponent } from 'libs/subject/address/feature/src/lib/address-edit.modal';
import { Languages } from '@bk2/shared-categories';
import { AddressModalsService } from 'libs/subject/address/feature/src/lib/address-modals.service';

export type AddressAccordionState = {
  parentKey: string;
};

export const initialState: AddressAccordionState = {
  parentKey: ''
};
    
export const AddressAccordionStore = signalStore(
  withState(initialState),
  withProps(() => ({
    addressService: inject(AddressService),
    router: inject(Router),
    appStore: inject(AppStore),
    firestoreService: inject(FirestoreService),
    modalController: inject(ModalController),
    alertController: inject(AlertController),
    toastController: inject(ToastController),
    addressModalsService: inject(AddressModalsService)
  })),
  withProps((store) => ({
    addressesResource: rxResource({
      params: () => ({
        parentKey: store.parentKey()
      }),
      stream: ({params}) => {
        if (!params.parentKey?.length) return of([]);
        const dbQuery = getSystemQuery(store.appStore.tenantId());
        dbQuery.push({ key: 'parentKey', operator: '==', value: params.parentKey });
        return store.appStore.firestoreService.searchData<AddressModel>(AddressCollection, dbQuery, 'channelType', 'asc');
      }
    }),
  })),

  withComputed((state) => {
    return {
      addresses: computed(() => state.addressesResource.value()),
      currentUser: computed(() => state.appStore.currentUser()),
      tenantId: computed(() => state.appStore.tenantId()),
      imgixBaseUrl: computed(() => state.appStore.env.services.imgixBaseUrl),
    };
  }),

  withMethods((store) => {
    return {
      reset() {
        patchState(store, initialState);
        store.addressesResource.reload();
      },

      reload() {
        store.addressesResource.reload();
      },
      
      /******************************** setters (filter) ******************************************* */
      setParentKey(parentKey: string) {
        patchState(store, { parentKey });
      },

      /******************************* actions *************************************** */
      async add(readOnly = true): Promise<void> {
        if (readOnly) return;
        const newAddress = new AddressModel(store.tenantId());
        newAddress.parentKey = store.parentKey();
        await this.edit(newAddress, readOnly);
      },

      /**
       * Shows a modal to edit an address.
       * @param address 
       * @param readOnly 
       */
       async edit(address: AddressModel, readOnly = true): Promise<void> {
        const modal = await store.modalController.create({
        component: AddressEditModalComponent,
        componentProps: {
            address: address,
            currentUser: store.currentUser(),
            readOnly: readOnly
        }
        });
        modal.present();
        const { data, role } = await modal.onWillDismiss();
        if (role === 'confirm' && data) {
        if (isAddress(data, store.tenantId())) {
            await (!data.bkey ? 
            store.addressService.create(data, store.currentUser()) : 
            store.addressService.update(data, store.currentUser()));
            this.reload();
        }
        }
      },

      async export(type: string): Promise<void> {
        console.log(`AddressesAccordionStore.export(${type}) ist not yet implemented`);
      },

      async delete(address?: AddressModel, readOnly = true): Promise<void> {
        if (!address || readOnly) return;
        const result = await confirm(store.alertController, '@subject.address.operation.delete.askConfirmation', true);
        if (result === true) {
          await store.addressService.delete(address, store.currentUser());
          this.reload();
        }
      },

     /**
      * Copy the address to the Clipboard.
      * @param address 
      */
      async copy(address: AddressModel): Promise<void> {
        await copyAddress(store.toastController, address, Languages[DefaultLanguage].abbreviation);
      },

      async sendEmail(email: string): Promise<void> {
        return await browseUrl(`mailto:${email}`);
      },
      
      async call(phone: string): Promise<void> {
        return await browseUrl(`tel:${phone}`);
      },

      async showPostalAddress(address: AddressModel): Promise<void> {
        return await store.addressModalsService.show(address);
      },

      async uploadQrEzs(address: AddressModel, readOnly = true): Promise<string | undefined> {
        if (!address || readOnly) return undefined;
        const url = await store.addressModalsService.uploadEzs(address);
        if (url) {
          address.url = url;
          await store.addressService.update(address, store.currentUser());
        }
        return url;
      },

      async showQrEzs(address: AddressModel): Promise<void> {
        return await store.addressModalsService.showQrPaymentSlip(address.url);
      },

      async openUrl(address: AddressModel): Promise<void> {
        await store.addressModalsService.use(address);
      }
    }
  })
);

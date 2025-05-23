import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';
import { computed, inject } from '@angular/core';

import { FIRESTORE } from '@bk2/shared/config';
import { AppStore } from '@bk2/auth/feature';
import { LogInfo } from '@bk2/shared/models';

import { warn } from '@bk2/shared/util';
import { copyToClipboard, showToast } from '@bk2/shared/i18n';
import { ToastController } from '@ionic/angular/standalone';

export type AocStorageState = {
  filePath: string;
  dirPath: string;
  log: LogInfo[];
  logTitle: string;
};

export const initialState: AocStorageState = {
  filePath: '',
  dirPath: '',
  log: [],
  logTitle: ''
};

export const AocStorageStore = signalStore(
  withState(initialState),
  withProps(() => ({
    appStore: inject(AppStore),
    firestore: inject(FIRESTORE),
    toastController: inject(ToastController)
  })),
/*   withProps((store) => ({
    dataResource: rxResource({
      request: () => ({
        filePath: store.filePath()
      }),
      loader: ({request}): Observable<BkModel[] | undefined> => {
      }
    })
  })), */

  withComputed((state) => {
    return {
      currentUser: computed(() => state.appStore.currentUser()),
      //isLoading: computed(() => state.dataResource.isLoading()),
      //data: computed(() => state.dataResource.value() ?? []),
    }
  }),

  withMethods((store) => {
    return {

      /******************************** setters (filter) ******************************************* */
      setFilePath(filePath: string): void {
        patchState(store, { filePath, log: [], logTitle: '' });
      },

      setDirPath(dirPath: string): void {
        patchState(store, { dirPath, log: [], logTitle: '' });
      },

      /******************************** actions          ******************************************* */
      async getSize() {
        if (this.setDirPath.length === 0) {
          warn('AocStorageStore.getSize: dirPath is empty');
        }
        // this.size = await this.documentService.getSize(this.path) ?? 0;
        // tbd: write result into loginfo
      },

      async getRefInfo() {
        console.log('getRefInfo is not yet implemented');
        //await this.documentService.getRefInfo(this.path);
      },

      async calculateStorageConsumption() {
        console.log('calculateStorageConsumption is not yet implemented');
        //await this.documentService.calculateStorageConsumption(this.path, this.isRecursive);
      },

      async copyPath(isFilePath: boolean) {
        const _path = isFilePath ? store.filePath() : store.dirPath();
        copyToClipboard(_path);
        showToast(store.toastController, '@general.operation.copy.conf', store.appStore.env.settingsDefaults.toastLength);  
      },

      clearPath(isFilePath: boolean): void {
        if (isFilePath) {
          patchState(store, { filePath: '', log: [], logTitle: '' });
        } else {
          patchState(store, { dirPath: '', log: [], logTitle: '' });
        }
      }
    }
  })
);
 

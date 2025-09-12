import { AsyncPipe } from '@angular/common';
import { Component, computed, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { IonButton, IonButtons, IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonCheckbox, IonCol, IonContent, IonGrid, IonIcon, IonItem, IonRow } from '@ionic/angular/standalone';

import { TranslatePipe } from '@bk2/shared-i18n';
import { SvgIconPipe } from '@bk2/shared-pipes';
import { ButtonComponent, HeaderComponent, ResultLogComponent } from '@bk2/shared-ui';
import { AocStorageStore } from './aoc-storage.store';

@Component({
  selector: 'bk-aoc-storage',
  standalone: true,
  styles: [
    `
      input {
        width: 100%;
      }
    `,
  ],
  imports: [TranslatePipe, AsyncPipe, SvgIconPipe, FormsModule, ButtonComponent, HeaderComponent, ResultLogComponent, IonContent, IonCard, IonCardHeader, IonCardContent, IonCardTitle, IonGrid, IonRow, IonCol, IonIcon, IonCheckbox, IonButtons, IonButton, IonItem],
  providers: [AocStorageStore],
  template: `
    <bk-header title="{{ '@aoc.storage.title' | translate | async }}" />
    <ion-content>
      <ion-card>
        <ion-card-header>
          <ion-card-title>{{ '@aoc.storage.info.title' | translate | async }}</ion-card-title>
        </ion-card-header>
        <ion-card-content>
          <ion-grid>
            <ion-row>
              <ion-col>{{ '@aoc.storage.info.content' | translate | async }}</ion-col>
            </ion-row>
            <ion-row>
              <ion-col size="12">
                <ion-item lines="none">
                  <input type="text" [ngModel]="filePath()" (ionInput)="setFilePath($event)" />
                  <ion-buttons slot="end">
                    <ion-button fill="clear" (click)="copyPath(true)">
                      <ion-icon src="{{ 'copy' | svgIcon }}" />
                    </ion-button>
                    <ion-button fill="clear" (click)="clearPath(true)">
                      <ion-icon src="{{ 'close_cancel' | svgIcon }}" />
                    </ion-button>
                  </ion-buttons>
                </ion-item>
              </ion-col>
            </ion-row>
            <ion-row>
              <ion-col size="6">
                <bk-button [disabled]="isFilePathButtonDisabled()" label="{{ '@aoc.storage.info.buttonLabel' | translate | async }}" iconName="checkbox-circle" (click)="getRefInfo()" />
              </ion-col>
            </ion-row>
          </ion-grid>
        </ion-card-content>
      </ion-card>

      <ion-card>
        <ion-card-header>
          <ion-card-title>{{ '@aoc.storage.sizes.title' | translate | async }}</ion-card-title>
        </ion-card-header>
        <ion-card-content>
          <ion-grid>
            <ion-row>
              <ion-col>{{ '@aoc.storage.sizes.content' | translate | async }}</ion-col>
            </ion-row>
            <ion-row>
              <ion-col><ion-checkbox labelPlacement="end" [(ngModel)]="isRecursive">Rekursiv</ion-checkbox></ion-col>
            </ion-row>
            <ion-row>
              <ion-col size="12">
                <ion-item lines="none">
                  <input type="text" [ngModel]="dirPath()" (ionInput)="setDirPath($event)" />
                  <ion-buttons slot="end">
                    <ion-button fill="clear" (click)="copyPath(false)">
                      <ion-icon src="{{ 'copy' | svgIcon }}" />
                    </ion-button>
                    <ion-button fill="clear" (click)="clearPath(false)">
                      <ion-icon src="{{ 'close_cancel' | svgIcon }}" />
                    </ion-button>
                  </ion-buttons>
                </ion-item>
              </ion-col>
            </ion-row>
            <ion-row>
              <ion-col size="6">
                <bk-button [disabled]="isDirPathButtonDisabled()" label="{{ '@aoc.storage.sizes.buttonLabel' | translate | async }}" iconName="checkbox-circle" (click)="calculateStorageConsumption()" />
              </ion-col>
            </ion-row>
          </ion-grid>
        </ion-card-content>
      </ion-card>

      <bk-result-log [title]="logTitle()" [log]="logInfo()" />
    </ion-content>
  `,
})
export class AocStorageComponent {
  private readonly aocStorageStore = inject(AocStorageStore);

  protected readonly logTitle = computed(() => this.aocStorageStore.logTitle());
  protected readonly logInfo = computed(() => this.aocStorageStore.log());
  //  protected readonly isLoading = computed(() => this.aocStorageStore.isLoading());
  protected readonly filePath = computed(() => this.aocStorageStore.filePath());
  protected readonly dirPath = computed(() => this.aocStorageStore.dirPath());
  protected readonly isFilePathButtonDisabled = computed(() => this.filePath.length === 0);
  protected readonly isDirPathButtonDisabled = computed(() => this.dirPath.length === 0);

  protected isRecursive = false;

  /************************************** setters ****************************************** */
  protected setFilePath(event: Event) {
    console.log('setFilePath', event);
    //const _filePath = event.value;
    //this.aocStorageStore.setFilePath(_filePath);
  }

  protected setDirPath(event: Event) {
    console.log('setDirPath', event);

    // const _dirPath = event.value;
    // this.aocStorageStore.setDirPath(_dirPath);
  }
  /************************************** actions ****************************************** */

  protected async getSize(): Promise<void> {
    await this.aocStorageStore.getSize();
  }

  protected async getRefInfo() {
    await this.aocStorageStore.getRefInfo();
  }

  protected async calculateStorageConsumption() {
    await this.aocStorageStore.calculateStorageConsumption();
  }

  protected async copyPath(isFilePath: boolean): Promise<void> {
    await this.aocStorageStore.copyPath(isFilePath);
  }

  protected clearPath(isFilePath: boolean): void {
    this.aocStorageStore.clearPath(isFilePath);
  }
}

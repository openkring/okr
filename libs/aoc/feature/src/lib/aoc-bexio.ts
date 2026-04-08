import { AsyncPipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { IonButton, IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonCheckbox, IonCol, IonContent, IonGrid, IonIcon, IonItem, IonLabel, IonRow, IonSpinner } from '@ionic/angular/standalone';

import { TranslatePipe } from '@bk2/shared-i18n';
import { SvgIconPipe } from '@bk2/shared-pipes';
import { HeaderComponent } from '@bk2/shared-ui';
import { AvatarLabelComponent } from '@bk2/avatar-ui';
import { ColorIonic } from '@bk2/shared-models';
import { DateFormat, getFullName, getTodayStr, isAfterDate } from '@bk2/shared-util-core';

import { AocBexioStore, BexioIndex } from './aoc-bexio.store';

@Component({
  selector: 'bk-aoc-bexio',
  standalone: true,
  imports: [
    AsyncPipe, TranslatePipe, SvgIconPipe,
    HeaderComponent, AvatarLabelComponent,
    IonContent, IonCard, IonCardHeader, IonCardTitle, IonCardContent,
    IonGrid, IonRow, IonCol, IonItem, IonLabel, IonButton, IonIcon, IonSpinner, IonCheckbox,
  ],
  providers: [AocBexioStore],
  template: `
    <bk-header title="@aoc.bexio.title" />
    <ion-content>
      <ion-card>
        <ion-card-header>
          <ion-card-title>{{ '@aoc.bexio.index.title' | translate | async }}</ion-card-title>
        </ion-card-header>
        <ion-card-content>
          <ion-grid>
            <ion-row>
              <ion-col size="9">{{ '@aoc.bexio.index.content' | translate | async }}</ion-col>
              <ion-col size="3">
                <ion-button (click)="buildIndex()" [disabled]="isLoading()">
                  @if(isLoading()) {
                    <ion-spinner name="crescent" slot="start" />
                  } @else {
                    <ion-icon src="{{ 'sync' | svgIcon }}" slot="start" />
                  }
                  {{ '@aoc.bexio.index.button' | translate | async }}
                </ion-button>
              </ion-col>
            </ion-row>
            <ion-row>
              <ion-col>
                <ion-checkbox labelPlacement="end" [checked]="showOnlyCurrentMembers()" (ionChange)="showOnlyCurrentMembers.set($event.detail.checked)">Show only current members</ion-checkbox>
              </ion-col>
            </ion-row>
            @if(filteredIndex().length > 0) {
              <ion-row>
                <ion-item lines="none">
                  <small>{{ filteredIndex().length }}</small>
                </ion-item>
              </ion-row>
              <ion-row>
                <ion-col size="5"><strong>Name</strong></ion-col>
                <ion-col size="3"><strong>BK Bexio ID</strong></ion-col>
                <ion-col size="3"><strong>Bexio ID</strong></ion-col>
              </ion-row>
              @for(item of filteredIndex(); track item.key + '_' + item.bkey + '_' + item.bx_id) {
                <ion-row>
                  <ion-col size="5">
                    @if(item.bkey) {
                      <bk-avatar-label
                        [key]="avatarKey(item)"
                        [label]="displayName(item)"
                        [color]="color"
                        [alt]="displayName(item)"
                      />
                    } @else {
                      <ion-item lines="none">
                        <ion-label color="medium">{{ displayName(item) }}</ion-label>
                      </ion-item>
                    }
                  </ion-col>
                  <ion-col size="3">
                    <ion-item lines="none">
                      <ion-label>{{ item.bexioId || '' }}</ion-label>
                      @if(!item.bexioId && item.bx_id) {
                        <ion-button slot="end" fill="clear" (click)="addToBk(item)">
                          <ion-icon src="{{ 'add-circle' | svgIcon }}" slot="icon-only" />
                        </ion-button>
                      }
                    </ion-item>
                  </ion-col>
                  <ion-col size="3">
                    <ion-item lines="none">
                      <ion-label>{{ item.bx_id || '' }}</ion-label>
                      @if(item.bexioId && !item.bx_id) {
                        <ion-button slot="end" fill="clear" (click)="addToBexio(item)">
                          <ion-icon src="{{ 'add-circle' | svgIcon }}" slot="icon-only" />
                        </ion-button>
                      }
                    </ion-item>
                  </ion-col>
                  <ion-col size="1">
                    <ion-item lines="none">
                      <ion-button slot="end" fill="clear" (click)="edit(item)">
                        <ion-icon src="{{ 'address' | svgIcon }}" slot="icon-only" [color]="addressColor(item)" />
                      </ion-button>
                    </ion-item>
                  </ion-col>
                </ion-row>
              }
            }
          </ion-grid>
        </ion-card-content>
      </ion-card>
    </ion-content>
  `,
})
export class AocBexio {
  protected readonly store = inject(AocBexioStore);
  protected readonly color = ColorIonic.Light;

  protected readonly isLoading = computed(() => this.store.isLoading());
  protected readonly index = computed(() => this.store.index());

  protected showOnlyCurrentMembers = signal(false);
  protected readonly filteredIndex = computed(() => {
    const today = getTodayStr(DateFormat.StoreDate);
    if (this.showOnlyCurrentMembers()) {
      return this.index().filter(i => {
        if (!i.dateOfExit || i.dateOfExit.length !== 8) return false;
        return isAfterDate(i.dateOfExit, today);
      })
    } else {
      return this.index();
    }
  });

  protected avatarKey(item: BexioIndex): string {
    return `${item.type}.${item.bkey}`;
  }

  protected displayName(item: BexioIndex): string {
    if (item.bkey) return getFullName(item.name1, item.name2) || item.name1;
    return getFullName(item.bx_name1, item.bx_name2) || item.bx_name1;
  }

  protected async buildIndex(): Promise<void> {
    await this.store.buildIndex();
  }

  protected async addToBexio(item: BexioIndex): Promise<void> {
    await this.store.addToBexio(item);
  }

  protected async addToBk(item: BexioIndex): Promise<void> {
    await this.store.addToBk(item);
  }

  protected addressColor(item: BexioIndex): string {
    return this.store.compareAddressData(item) ? 'success' : 'danger';
  }

  protected async edit(item: BexioIndex): Promise<void> {
    console.log(item);
    await this.store.edit(item);
  }
}

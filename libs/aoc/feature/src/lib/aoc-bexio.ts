import { AsyncPipe } from '@angular/common';
import { Component, computed, inject } from '@angular/core';
import { IonButton, IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonCol, IonContent, IonGrid, IonIcon, IonItem, IonLabel, IonRow, IonSpinner } from '@ionic/angular/standalone';

import { TranslatePipe } from '@bk2/shared-i18n';
import { SvgIconPipe } from '@bk2/shared-pipes';
import { HeaderComponent, ResultLogComponent } from '@bk2/shared-ui';
import { AvatarLabelComponent } from '@bk2/avatar-ui';
import { ColorIonic, LogInfo } from '@bk2/shared-models';
import { getFullName } from '@bk2/shared-util-core';

import { AocBexioStore, BexioIndex } from './aoc-bexio.store';

@Component({
  selector: 'bk-aoc-bexio',
  standalone: true,
  imports: [
    AsyncPipe, TranslatePipe, SvgIconPipe,
    HeaderComponent, AvatarLabelComponent, ResultLogComponent,
    IonContent, IonCard, IonCardHeader, IonCardTitle, IonCardContent,
    IonGrid, IonRow, IonCol, IonItem, IonLabel, IonButton, IonIcon, IonSpinner,
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
            @if(index().length > 0) {
              <ion-row>
                <ion-col size="6"><strong>Name</strong></ion-col>
                <ion-col size="3"><strong>BK Bexio ID</strong></ion-col>
                <ion-col size="3"><strong>Bexio ID</strong></ion-col>
              </ion-row>
              @for(item of index(); track item.key) {
                <ion-row>
                  <ion-col size="6">
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
                      <ion-label>{{ item.bbexioid || '' }}</ion-label>
                      @if(!item.bbexioid && item.bxid) {
                        <ion-button slot="end" size="small" fill="clear" (click)="addToBk(item)">
                          <ion-icon src="{{ 'add' | svgIcon }}" slot="icon-only" />
                        </ion-button>
                      }
                    </ion-item>
                  </ion-col>
                  <ion-col size="3">
                    <ion-item lines="none">
                      <ion-label>{{ item.bxid || '' }}</ion-label>
                      @if(item.bbexioid && !item.bxid) {
                        <ion-button slot="end" size="small" fill="clear" (click)="addToBexio(item)">
                          <ion-icon src="{{ 'add' | svgIcon }}" slot="icon-only" />
                        </ion-button>
                      }
                    </ion-item>
                  </ion-col>
                </ion-row>
              }
            }
          </ion-grid>
        </ion-card-content>
      </ion-card>
      <bk-result-log title="Log" [log]="logItems()" />
    </ion-content>
  `,
})
export class AocBexio {
  protected readonly store = inject(AocBexioStore);
  protected readonly color = ColorIonic.Light;

  protected readonly isLoading = computed(() => this.store.isLoading());
  protected readonly index = computed(() => this.store.index());
  protected readonly logItems = computed<LogInfo[]>(() => this.store.log());

  protected avatarKey(item: BexioIndex): string {
    return `${item.type}.${item.bkey}`;
  }

  protected displayName(item: BexioIndex): string {
    if (item.bkey) return getFullName(item.bname1, item.bname2) || item.bname1;
    return getFullName(item.bxname1, item.bxname2) || item.bxname1;
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
}

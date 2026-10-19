import { Component, computed, inject, linkedSignal } from '@angular/core';
import { IonButton, IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonCol, IonContent, IonGrid, IonIcon, IonItem, IonLabel, IonRow, IonSpinner } from '@ionic/angular';

import { SvgIconPipe } from '@okr/shared-pipes';
import { Header, StringSelect, StringSelectI18n } from '@okr/shared-ui';
import { AvatarLabel } from '@okr/avatar-ui';
import { ColorIonic } from '@okr/shared-models';
import { DateFormat, getFullName, getTodayStr, isAfterDate } from '@okr/shared-util-core';
import { BexioIndex } from '@okr/subject-person-util';

import { PersonBexioStore } from './person-bexio.store';

@Component({
  selector: 'okr-person-bexio',
  standalone: true,
  imports: [
    SvgIconPipe,
    Header, AvatarLabel, StringSelect,
    IonContent, IonCard, IonCardHeader, IonCardTitle, IonCardContent,
    IonGrid, IonRow, IonCol, IonItem, IonLabel, IonButton, IonIcon, IonSpinner,
  ],
  providers: [PersonBexioStore],
  styles: [`
    /* Bexio-only contacts (no BK record, hence no avatar): flag the label column danger */
    .bexio-only { background-color: var(--ion-color-danger); }
    .bexio-only ion-item { --background: transparent; --color: var(--ion-color-danger-contrast); }
  `],
  template: `
    <okr-header [i18n]="{ title: store.i18n.bexio_title() }" />
    <ion-content>
      <ion-card>
        <ion-card-header>
          <ion-card-title>{{ store.i18n.bexio_index_title() }}</ion-card-title>
        </ion-card-header>
        <ion-card-content>
          <ion-grid>
            <ion-row>
              <ion-col size="9">{{ store.i18n.bexio_index_content() }}</ion-col>
              <ion-col size="3">
                <ion-button (click)="buildIndex()" [disabled]="isLoading()">
                  @if(isLoading()) {
                    <ion-spinner name="crescent" slot="start" />
                  } @else {
                    <ion-icon src="{{ 'sync' | svgIcon }}" slot="start" />
                  }
                  {{ store.i18n.bexio_index_button() }}
                </ion-button>
              </ion-col>
            </ion-row>
            @if(indexError()) {
              <ion-row>
                <ion-col size="12">
                  <ion-item lines="none" color="danger">
                    <ion-icon src="{{ 'alert' | svgIcon }}" slot="start" />
                    <ion-label class="ion-text-wrap">{{ indexError() }}</ion-label>
                  </ion-item>
                </ion-col>
              </ion-row>
            }
            <ion-row>
              <ion-col size="6">
                <okr-string-select [i18n]="contactFilterI18n()" [selectedString]="contactFilter()" (selectedStringChange)="contactFilter.set($event)" [stringList]="contactFilters()" [readOnly]="false" />
              </ion-col>
            </ion-row>
            @if(filteredIndex().length > 0) {
              <ion-row>
                <ion-item lines="none">
                  <small>{{ filteredIndex().length }}</small>
                </ion-item>
              </ion-row>
              <ion-row>
                <ion-col size="5"><strong>{{ store.i18n.bexio_col_name() }}</strong></ion-col>
                <ion-col size="1"><strong>{{ store.i18n.bexio_col_category() }}</strong></ion-col>
                <ion-col size="3"><strong>{{ store.i18n.bexio_col_bk_bexio_id() }}</strong></ion-col>
                <ion-col size="3"><strong>{{ store.i18n.bexio_col_bexio_id() }}</strong></ion-col>
              </ion-row>
              @for(item of filteredIndex(); track item.key + '_' + item.okey + '_' + item.bx_id) {
                <ion-row style="cursor: pointer" (click)="edit(item)">
                  <ion-col size="5" [class.bexio-only]="!item.okey">
                    @if(item.okey) {
                      <okr-avatar-label
                        [key]="avatarKey(item)"
                        [label]="displayName(item)"
                        [color]="avatarColor(item)"
                        [alt]="displayName(item)"
                      />
                    } @else {
                      <ion-item lines="none">
                        <ion-label>{{ displayName(item) }}</ion-label>
                      </ion-item>
                    }
                  </ion-col>
                  <ion-col size="1">
                    <ion-item lines="none">
                      <ion-label>{{ item.mcat }}</ion-label>
                    </ion-item>
                  </ion-col>
                  <ion-col size="3">
                    <ion-item lines="none">
                      <ion-label>{{ item.bexioId || '' }}</ion-label>
                    </ion-item>
                  </ion-col>
                  <ion-col size="3">
                    <ion-item lines="none">
                      <ion-label>{{ item.bx_id || '' }}</ion-label>
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
export class PersonBexio {
  protected readonly store = inject(PersonBexioStore);

  protected readonly isLoading = computed(() => this.store.isLoading());
  protected readonly indexError = computed(() => this.store.indexError());
  protected readonly index = computed(() => this.store.index());

  // the string-select works on display strings, so the stable key is derived by position
  private readonly contactFilterKeys = ['all', 'persons', 'members', 'orgs', 'mismatch'] as const;
  protected readonly contactFilters = computed(() => [
    this.store.i18n.bexio_filter_all(), this.store.i18n.bexio_filter_persons(),
    this.store.i18n.bexio_filter_members(), this.store.i18n.bexio_filter_orgs(),
    this.store.i18n.bexio_filter_mismatch(),
  ]);
  protected contactFilter = linkedSignal(() => this.contactFilters()[0]);
  private readonly contactFilterKey = computed(() =>
    this.contactFilterKeys[Math.max(0, this.contactFilters().indexOf(this.contactFilter()))]);
  protected readonly contactFilterI18n = computed(() => ({
    name: 'bexioContactFilter',
    label: this.store.i18n.bexio_index_contactFilter_label(),
  } as StringSelectI18n));
  protected readonly filteredIndex = computed(() => {
    const today = getTodayStr(DateFormat.StoreDate);
    switch (this.contactFilterKey()) {
      case 'persons':  return this.index().filter(i => i.type === 'person');
      case 'members':  return this.index().filter(i => isAfterDate(i.dateOfExit, today));
      case 'orgs':     return this.index().filter(i => i.type === 'org');
      case 'mismatch': return this.index().filter(i => !this.store.compareAddressData(i));
      default:                return this.index();
    }
  });

  protected avatarKey(item: BexioIndex): string {
    return `${item.type}.${item.okey}`;
  }

  protected displayName(item: BexioIndex): string {
    if (item.okey) return getFullName(item.name1, item.name2) || item.name1;
    return getFullName(item.bx_name1, item.bx_name2) || item.bx_name1;
  }

  protected async buildIndex(): Promise<void> {
    await this.store.buildIndex();
  }

  protected avatarColor(item: BexioIndex): ColorIonic {
    return this.store.compareAddressData(item) ? ColorIonic.Success : ColorIonic.Danger;
  }

  protected async edit(item: BexioIndex): Promise<void> {
    await this.store.edit(item);
  }
}

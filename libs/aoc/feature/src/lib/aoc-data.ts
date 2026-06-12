import { Component, computed, inject, linkedSignal, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonCol, IonContent, IonGrid, IonIcon, IonItem, IonRow } from '@ionic/angular/standalone';

import { Button, CategorySelect, Header, ResultLog } from '@bk2/shared-ui';
import { hasRole } from '@bk2/shared-util-core';
import { PersonModelName } from '@bk2/shared-models';
import { SvgIconPipe } from '@bk2/shared-pipes';

import { AocDataStore, FavMismatch } from './aoc-data.store';

@Component({
  selector: 'bk-aoc-data',
  standalone: true,
  imports: [
    SvgIconPipe,
    FormsModule,
    Header, ResultLog, Button, CategorySelect,
    IonContent, IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonGrid, IonRow, IonCol, IonItem, IonIcon
  ],
  providers: [AocDataStore],
  template: `
    <bk-header [i18n]="{ title: store.i18n.title() }" />
    <ion-content>
      <ion-card>
        <ion-card-content>
          <ion-grid>
            <ion-row>
              <ion-col>{{ store.i18n.content() }}</ion-col>
            </ion-row>
          </ion-grid>
        </ion-card-content>
      </ion-card>

      <ion-card>
        <ion-card-header>
          <ion-card-title>{{ store.i18n.data_fix_title() }}</ion-card-title>
        </ion-card-header>
        <ion-card-content>
          <ion-grid>
            <ion-row>
              <ion-col>{{ store.i18n.data_fix_content() }}</ion-col>
              <ion-col>
                <bk-button label=" {{ store.i18n.data_fix_button() }}" iconName="warning" (click)="fixModels()" />
              </ion-col>
            </ion-row>
          </ion-grid>
        </ion-card-content>
      </ion-card>

      <ion-card>
        <ion-card-header>
          <ion-card-title>{{ store.i18n.data_validate_title() }}</ion-card-title>
        </ion-card-header>
        <ion-card-content>
          <ion-grid>
            <ion-row>
              <ion-col>{{ store.i18n.data_validate_content() }}</ion-col>
            </ion-row>
            <ion-row>
              <ion-col>
                <ion-item lines="none">
                  <bk-cat-select [category]="types()!" [selectedItemName]="modelType()" (selectedItemNameChange)="store.setModelType($event)" [withAll]="false" [readOnly]="readOnly()" />
                </ion-item>
              </ion-col>
              <ion-col>
                <bk-button label=" {{ store.i18n.data_validate_button() }}" iconName="info-circle" (click)="validateModels()" />
              </ion-col>
            </ion-row>
          </ion-grid>
        </ion-card-content>
      </ion-card>

      <ion-card>
        <ion-card-header>
          <ion-card-title>{{ store.i18n.data_index_title() }}</ion-card-title>
        </ion-card-header>
        <ion-card-content>
          <ion-grid>
            <ion-row>
              <ion-col>{{ store.i18n.data_index_content() }}</ion-col>
            </ion-row>
            <ion-row>
              <ion-col>
                <ion-item lines="none">
                  <bk-cat-select [category]="types()!" [selectedItemName]="modelType()" (selectedItemNameChange)="store.setModelType($event)" [withAll]="false" [readOnly]="readOnly()" />
                </ion-item>
              </ion-col>
              <ion-col>
                <bk-button label=" {{ store.i18n.data_index_button() }}" iconName="warning" (click)="createIndexesOnCollection()" />
              </ion-col>
            </ion-row>
          </ion-grid>
        </ion-card-content>
      </ion-card>
      <bk-result-log [title]="logTitle()"  cardTitle="Resultat" [log]="logInfo()" />

      <ion-card>
        <ion-card-header>
          <ion-card-title>{{ store.i18n.data_fav_title() }}</ion-card-title>
        </ion-card-header>
        <ion-card-content>
          <ion-grid>
            <ion-row>
              <ion-col>{{ store.i18n.data_fav_description() }}</ion-col>
              <ion-col>
                <bk-button 
                  [label]="favMismatches().length > 0 ? store.i18n.data_fav_hide() : store.i18n.data_fav_validate()"
                  iconName="info-circle" 
                  [disabled]="isLoading()"
                  (click)="toggleFavAddresses()" 
                />
              </ion-col>
            </ion-row>
            @if (favMismatches().length > 0) {
              <ion-row>
                <ion-col size="2"><strong>{{ store.i18n.data_fav_person() }}</strong></ion-col>
                <ion-col size="2"><strong>{{ store.i18n.data_fav_field() }}</strong></ion-col>
                <ion-col size="3"><strong>{{ store.i18n.data_fav_favperson() }}</strong></ion-col>
                <ion-col size="1"></ion-col>
                <ion-col size="1"></ion-col>
                <ion-col size="3"><strong>{{ store.i18n.data_fav_address() }}</strong></ion-col>
              </ion-row>
              @for (m of favMismatches(); track m.personKey + m.field) {
                <ion-row>
                  <ion-col size="2"><small>{{ m.personName }}</small></ion-col>
                  <ion-col size="2"><small>{{ m.field }}</small></ion-col>
                  <ion-col size="3"><small>{{ m.cached }}</small></ion-col>
                  <ion-col size="1">
                    <ion-icon src="{{ 'arrow-back-circle' | svgIcon }}" (click)="repairFavMismatch(m, 'toPerson')" />
                  </ion-col>
                  <ion-col size="1">
                    <ion-icon src="{{ 'arrow-forward-circle' | svgIcon }}" (click)="repairFavMismatch(m, 'toAddress')" />
                  </ion-col>
                  <ion-col size="3"><small>{{ m.fromAddress }}</small></ion-col>
                </ion-row>
              }
            } @else if (favChecked()) {
              <ion-row><ion-col><small>{{ store.i18n.data_fav_nomismatches() }}</small></ion-col></ion-row>
            }
          </ion-grid>
        </ion-card-content>
      </ion-card>
    </ion-content>
  `,
})
export class AocData {
  protected readonly store = inject(AocDataStore);

  protected modelType = linkedSignal(() => this.store.modelType() ?? PersonModelName);
  protected readonly logTitle = computed(() => this.store.logTitle());
  protected readonly logInfo = computed(() => this.store.log());
  protected readonly isLoading = computed(() => this.store.isLoading());
  protected readonly types = computed(() => this.store.appStore.getCategory('model_type'));
  protected readonly readOnly = computed(() => !hasRole('admin', this.store.currentUser()));
  protected readonly favMismatches = computed(() => this.store.favMismatches());
  protected favChecked = signal(false);

  /**
   * Fix models of a given type. THIS CHANGES MANY DATA IN THE DATABASE.
   */
  public async fixModels(): Promise<void> {
    console.log('Starting to fix models. This may take some time...');
    await this.store.fixModels();
  }

  /**
   * Validate models of a given type. This checks the data in one collection of the database whether it is valid.
   */
  public async validateModels(): Promise<void> {
    await this.store.validateModels();
  }

  public async createIndexesOnCollection(): Promise<void> {
    await this.store.createIndexesOnCollection();
  }

  public async toggleFavAddresses(): Promise<void> {
    if (this.favMismatches().length > 0) {
      this.store.clearFavMismatches();
    } else {
      this.favChecked.set(false);
      await this.store.checkFavAddresses();
      this.favChecked.set(true);
    }
  }

  public async repairFavMismatch(mismatch: FavMismatch, direction: 'toPerson' | 'toAddress'): Promise<void> {
    await this.store.repairFavMismatch(mismatch, direction);
  }
}

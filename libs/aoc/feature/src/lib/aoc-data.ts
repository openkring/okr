import { Component, computed, inject, linkedSignal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonCol, IonContent, IonGrid, IonItem, IonRow } from '@ionic/angular';

import { Button, CategorySelect, Header, ResultLog } from '@okr/shared-ui';
import { hasRole } from '@okr/shared-util-core';
import { PersonModelName } from '@okr/shared-models';

import { AocDataStore } from './aoc-data.store';

@Component({
  selector: 'okr-aoc-data',
  standalone: true,
  imports: [
    FormsModule,
    Header, ResultLog, Button, CategorySelect,
    IonContent, IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonGrid, IonRow, IonCol, IonItem
  ],
  providers: [AocDataStore],
  template: `
    <okr-header [i18n]="{ title: store.i18n.title() }" />
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
                  <okr-cat-select [category]="types()!" [selectedItemName]="modelType()" (selectedItemNameChange)="store.setModelType($event)" [withAll]="false" [readOnly]="readOnly()" />
                </ion-item>
              </ion-col>
              <ion-col>
                <okr-button label=" {{ store.i18n.data_validate_button() }}" iconName="info-circle" (click)="validateModels()" />
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
                  <okr-cat-select [category]="types()!" [selectedItemName]="modelType()" (selectedItemNameChange)="store.setModelType($event)" [withAll]="false" [readOnly]="readOnly()" />
                </ion-item>
              </ion-col>
              <ion-col>
                <okr-button label=" {{ store.i18n.data_index_button() }}" iconName="warning" (click)="createIndexesOnCollection()" />
              </ion-col>
            </ion-row>
          </ion-grid>
        </ion-card-content>
      </ion-card>
      <okr-result-log [title]="logTitle()"  cardTitle="Resultat" [log]="logInfo()" />
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

  /**
   * Validate models of a given type. This checks the data in one collection of the database whether it is valid.
   */
  public async validateModels(): Promise<void> {
    await this.store.validateModels();
  }

  public async createIndexesOnCollection(): Promise<void> {
    await this.store.createIndexesOnCollection();
  }
}

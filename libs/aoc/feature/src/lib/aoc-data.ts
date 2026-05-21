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
    <bk-header [i18n]="{ title: aocDataStore.i18n.title() }" />
    <ion-content>
      <ion-card>
        <ion-card-content>
          <ion-grid>
            <ion-row>
              <ion-col>{{ aocDataStore.i18n.content() }}</ion-col>
            </ion-row>
          </ion-grid>
        </ion-card-content>
      </ion-card>

      <ion-card>
        <ion-card-header>
          <ion-card-title>{{ aocDataStore.i18n.fix_title() }}</ion-card-title>
        </ion-card-header>
        <ion-card-content>
          <ion-grid>
            <ion-row>
              <ion-col>{{ aocDataStore.i18n.fix_content() }}</ion-col>
              <ion-col>
                <bk-button label=" {{ aocDataStore.i18n.fix_button() }}" iconName="warning" (click)="fixModels()" />
              </ion-col>
            </ion-row>
          </ion-grid>
        </ion-card-content>
      </ion-card>

      <ion-card>
        <ion-card-header>
          <ion-card-title>{{ aocDataStore.i18n.validate_title() }}</ion-card-title>
        </ion-card-header>
        <ion-card-content>
          <ion-grid>
            <ion-row>
              <ion-col>{{ aocDataStore.i18n.validate_content() }}</ion-col>
            </ion-row>
            <ion-row>
              <ion-col>
                <ion-item lines="none">
                  <bk-cat-select [category]="types()!" [selectedItemName]="modelType()" (selectedItemNameChange)="aocDataStore.setModelType($event)" [withAll]="false" [readOnly]="readOnly()" />
                </ion-item>
              </ion-col>
              <ion-col>
                <bk-button label=" {{ aocDataStore.i18n.validate_button() }}" iconName="info-circle" (click)="validateModels()" />
              </ion-col>
            </ion-row>
          </ion-grid>
        </ion-card-content>
      </ion-card>

      <ion-card>
        <ion-card-header>
          <ion-card-title>{{ aocDataStore.i18n.index_title() }}</ion-card-title>
        </ion-card-header>
        <ion-card-content>
          <ion-grid>
            <ion-row>
              <ion-col>{{ aocDataStore.i18n.index_content() }}</ion-col>
            </ion-row>
            <ion-row>
              <ion-col>
                <ion-item lines="none">
                  <bk-cat-select [category]="types()!" [selectedItemName]="modelType()" (selectedItemNameChange)="aocDataStore.setModelType($event)" [withAll]="false" [readOnly]="readOnly()" />
                </ion-item>
              </ion-col>
              <ion-col>
                <bk-button label=" {{ aocDataStore.i18n.index_button() }}" iconName="warning" (click)="createIndexesOnCollection()" />
              </ion-col>
            </ion-row>
          </ion-grid>
        </ion-card-content>
      </ion-card>
      <bk-result-log [title]="logTitle()"  cardTitle="Resultat" [log]="logInfo()" />

      <ion-card>
        <ion-card-header>
          <ion-card-title>{{ aocDataStore.i18n.fav_title() }}</ion-card-title>
        </ion-card-header>
        <ion-card-content>
          <ion-grid>
            <ion-row>
              <ion-col>{{ aocDataStore.i18n.fav_description() }}</ion-col>
              <ion-col>
                <bk-button 
                  [label]="favMismatches().length > 0 ? aocDataStore.i18n.fav_hide() : aocDataStore.i18n.fav_validate()"
                  iconName="info-circle" 
                  [disabled]="isLoading()"
                  (click)="toggleFavAddresses()" 
                />
              </ion-col>
            </ion-row>
            @if (favMismatches().length > 0) {
              <ion-row>
                <ion-col size="2"><strong>{{ aocDataStore.i18n.fav_person() }}</strong></ion-col>
                <ion-col size="2"><strong>{{ aocDataStore.i18n.fav_field() }}</strong></ion-col>
                <ion-col size="3"><strong>{{ aocDataStore.i18n.fav_favperson() }}</strong></ion-col>
                <ion-col size="1"></ion-col>
                <ion-col size="1"></ion-col>
                <ion-col size="3"><strong>{{ aocDataStore.i18n.fav_address() }}</strong></ion-col>
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
              <ion-row><ion-col><small>{{ aocDataStore.i18n.fav_nomismatches() }}</small></ion-col></ion-row>
            }
          </ion-grid>
        </ion-card-content>
      </ion-card>
    </ion-content>
  `,
})
export class AocData {
  protected readonly aocDataStore = inject(AocDataStore);

  protected modelType = linkedSignal(() => this.aocDataStore.modelType() ?? PersonModelName);
  protected readonly logTitle = computed(() => this.aocDataStore.logTitle());
  protected readonly logInfo = computed(() => this.aocDataStore.log());
  protected readonly isLoading = computed(() => this.aocDataStore.isLoading());
  protected readonly types = computed(() => this.aocDataStore.appStore.getCategory('model_type'));
  protected readonly readOnly = computed(() => !hasRole('admin', this.aocDataStore.currentUser()));
  protected readonly favMismatches = computed(() => this.aocDataStore.favMismatches());
  protected favChecked = signal(false);

  /**
   * Fix models of a given type. THIS CHANGES MANY DATA IN THE DATABASE.
   */
  public async fixModels(): Promise<void> {
    console.log('Starting to fix models. This may take some time...');
    await this.aocDataStore.fixModels();
  }

  /**
   * Validate models of a given type. This checks the data in one collection of the database whether it is valid.
   */
  public async validateModels(): Promise<void> {
    await this.aocDataStore.validateModels();
  }

  public async createIndexesOnCollection(): Promise<void> {
    await this.aocDataStore.createIndexesOnCollection();
  }

  public async toggleFavAddresses(): Promise<void> {
    if (this.favMismatches().length > 0) {
      this.aocDataStore.clearFavMismatches();
    } else {
      this.favChecked.set(false);
      await this.aocDataStore.checkFavAddresses();
      this.favChecked.set(true);
    }
  }

  public async repairFavMismatch(mismatch: FavMismatch, direction: 'toPerson' | 'toAddress'): Promise<void> {
    await this.aocDataStore.repairFavMismatch(mismatch, direction);
  }
}

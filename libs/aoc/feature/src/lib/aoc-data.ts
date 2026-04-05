import { AsyncPipe } from '@angular/common';
import { Component, computed, inject, linkedSignal, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonCol, IonContent, IonGrid, IonIcon, IonItem, IonRow } from '@ionic/angular/standalone';

import { TranslatePipe } from '@bk2/shared-i18n';
import { ButtonComponent, CategorySelectComponent, HeaderComponent, ResultLogComponent } from '@bk2/shared-ui';
import { hasRole } from '@bk2/shared-util-core';

import { AocDataStore, FavMismatch } from './aoc-data.store';
import { PersonModelName } from '@bk2/shared-models';
import { SvgIconPipe } from '@bk2/shared-pipes';

@Component({
  selector: 'bk-aoc-data',
  standalone: true,
  imports: [
    TranslatePipe, AsyncPipe, SvgIconPipe,
    FormsModule,
    HeaderComponent, ResultLogComponent, ButtonComponent, CategorySelectComponent,
    IonContent, IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonGrid, IonRow, IonCol, IonItem, IonIcon
  ],
  providers: [AocDataStore],
  template: `
    <bk-header title="@aoc.data.title" />
    <ion-content>
      <ion-card>
        <ion-card-content>
          <ion-grid>
            <ion-row>
              <ion-col>{{ '@aoc.data.content' | translate | async }}</ion-col>
            </ion-row>
          </ion-grid>
        </ion-card-content>
      </ion-card>

      <ion-card>
        <ion-card-header>
          <ion-card-title>{{ '@aoc.data.fix.title' | translate | async }}</ion-card-title>
        </ion-card-header>
        <ion-card-content>
          <ion-grid>
            <ion-row>
              <ion-col>{{ '@aoc.data.fix.content' | translate | async }}</ion-col>
              <ion-col>
                <bk-button label=" {{ '@aoc.data.fix.operation.fix' | translate | async }}" iconName="warning" (click)="fixModels()" />
              </ion-col>
            </ion-row>
          </ion-grid>
        </ion-card-content>
      </ion-card>

      <ion-card>
        <ion-card-header>
          <ion-card-title>{{ '@aoc.data.validate.title' | translate | async }}</ion-card-title>
        </ion-card-header>
        <ion-card-content>
          <ion-grid>
            <ion-row>
              <ion-col>{{ '@aoc.data.validate.content' | translate | async }}</ion-col>
            </ion-row>
            <ion-row>
              <ion-col>
                <ion-item lines="none">
                  <bk-cat-select [category]="types()!" [selectedItemName]="modelType()" (selectedItemNameChange)="aocDataStore.setModelType($event)" [withAll]="false" [readOnly]="readOnly()" />
                </ion-item>
              </ion-col>
              <ion-col>
                <bk-button label=" {{ '@aoc.data.validate.operation.validate' | translate | async }}" iconName="info-circle" (click)="validateModels()" />
              </ion-col>
            </ion-row>
          </ion-grid>
        </ion-card-content>
      </ion-card>

      <ion-card>
        <ion-card-header>
          <ion-card-title>{{ '@aoc.data.createIndex.title' | translate | async }}</ion-card-title>
        </ion-card-header>
        <ion-card-content>
          <ion-grid>
            <ion-row>
              <ion-col>{{ '@aoc.data.createIndex.content' | translate | async }}</ion-col>
            </ion-row>
            <ion-row>
              <ion-col>
                <ion-item lines="none">
                  <bk-cat-select [category]="types()!" [selectedItemName]="modelType()" (selectedItemNameChange)="aocDataStore.setModelType($event)" [withAll]="false" [readOnly]="readOnly()" />
                </ion-item>
              </ion-col>
              <ion-col>
                <bk-button label=" {{ '@aoc.data.createIndex.operation.create' | translate | async }}" iconName="warning" (click)="createIndexesOnCollection()" />
              </ion-col>
            </ion-row>
          </ion-grid>
        </ion-card-content>
      </ion-card>
      <bk-result-log [title]="logTitle()" [log]="logInfo()" />

      <ion-card>
        <ion-card-header>
          <ion-card-title>Fav-Adressen Konsistenz</ion-card-title>
        </ion-card-header>
        <ion-card-content>
          <ion-grid>
            <ion-row>
              <ion-col>Vergleicht die gecachten fav*-Felder jeder Person mit den tatsächlichen Favorit-Adressen.</ion-col>
              <ion-col>
                <bk-button 
                  [label]="favMismatches().length > 0 ? 'Ausblenden' : 'Prüfen'" 
                  iconName="info-circle" 
                  [disabled]="isLoading()"
                  (click)="toggleFavAddresses()" 
                />
              </ion-col>
            </ion-row>
            @if (favMismatches().length > 0) {
              <ion-row>
                <ion-col size="2"><strong>Person</strong></ion-col>
                <ion-col size="2"><strong>Feld</strong></ion-col>
                <ion-col size="3"><strong>Person (fav*)</strong></ion-col>
                <ion-col size="1"></ion-col>
                <ion-col size="1"></ion-col>
                <ion-col size="3"><strong>In Adresse</strong></ion-col>
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
              <ion-row><ion-col><small>Keine Abweichungen gefunden.</small></ion-col></ion-row>
            }
          </ion-grid>
        </ion-card-content>
      </ion-card>
    </ion-content>
  `,
})
export class AocDataComponent {
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

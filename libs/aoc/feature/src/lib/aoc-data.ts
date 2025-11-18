import { AsyncPipe } from '@angular/common';
import { Component, computed, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonCol, IonContent, IonGrid, IonItem, IonRow } from '@ionic/angular/standalone';

import { TranslatePipe } from '@bk2/shared-i18n';
import { ButtonComponent, CategorySelectComponent, HeaderComponent, ResultLogComponent } from '@bk2/shared-ui';
import { AocDataStore } from './aoc-data.store';
import { hasRole } from '@bk2/shared-util-core';

@Component({
  selector: 'bk-aoc-data',
  standalone: true,
  imports: [
    TranslatePipe, AsyncPipe, 
    FormsModule,
    HeaderComponent, ResultLogComponent, ButtonComponent, CategorySelectComponent,
    IonContent, IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonGrid, IonRow, IonCol, IonItem
  ],
  providers: [AocDataStore],
  template: `
    <bk-header title="{{ '@aoc.data.title' | translate | async }}" />
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
                  <bk-cat-select [category]="types()!" selectedItemName="person" [withAll]="false" [readOnly]="readOnly()" (changed)="onCategoryChange($event)" />
                </ion-item>
              </ion-col>
              <ion-col>
                <bk-button label=" {{ '@aoc.data.validate.operation.validate' | translate | async }}" iconName="info-circle" (click)="validateModels()" />
              </ion-col>
            </ion-row>
          </ion-grid>
        </ion-card-content>
      </ion-card>

      <bk-result-log [title]="logTitle()" [log]="logInfo()" />
    </ion-content>
  `,
})
export class AocDataComponent {
  protected readonly aocDataStore = inject(AocDataStore);

  protected readonly logTitle = computed(() => this.aocDataStore.logTitle());
  protected readonly logInfo = computed(() => this.aocDataStore.log());
  protected readonly isLoading = computed(() => this.aocDataStore.isLoading());
  protected readonly types = computed(() => this.aocDataStore.appStore.getCategory('model_type'));
  protected readonly readOnly = computed(() => hasRole('admin', this.aocDataStore.currentUser()));

  protected onCategoryChange($event: string): void {
    this.aocDataStore.setModelType($event);
  }

  /**
   * Fix models of a given type. THIS CHANGES MANY DATA IN THE DATABASE.
   */
  public async fixModels(): Promise<void> {
    await this.aocDataStore.fixModels();
  }

  /**
   * Validate models of a given type. This checks the data in one collection of the database whether it is valid.
   */
  public async validateModels(): Promise<void> {
    await this.aocDataStore.validateModels();
  }
}

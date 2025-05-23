import { AsyncPipe } from "@angular/common";
import { Component, computed, inject } from "@angular/core";
import { FormsModule } from "@angular/forms";
import { IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonCol, IonContent, IonGrid, IonItem, IonRow } from "@ionic/angular/standalone";

import { TranslatePipe } from "@bk2/shared/i18n";
import { ButtonComponent, CategoryComponent, HeaderComponent, ResultLogComponent } from "@bk2/shared/ui";
import { AocDataStore } from "./aoc-data.store";
import { ModelTypes } from "@bk2/shared/categories";
import { ModelType } from "@bk2/shared/models";

@Component({
  selector: 'bk-aoc-data',
  imports: [
    TranslatePipe, AsyncPipe,
    FormsModule, 
    HeaderComponent, ResultLogComponent, ButtonComponent, CategoryComponent,
    IonContent, IonCard, IonCardContent, IonCardHeader, IonCardTitle,
    IonGrid, IonRow, IonCol, IonItem
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
          <ion-card-title>{{ '@aoc.data.fix.title' | translate | async  }}</ion-card-title>
        </ion-card-header>
        <ion-card-content>
          <ion-grid>
            <ion-row>
              <ion-col>{{ '@aoc.data.fix.content' | translate | async }}</ion-col>
              <ion-col>
                <bk-button label=" {{ '@aoc.data.fix.operation.fix' | translate | async  }}" iconName="warning-outline" (click)="fixModels()" />
              </ion-col>
            </ion-row>
          </ion-grid>
        </ion-card-content>
      </ion-card>

      <ion-card>
        <ion-card-header>
          <ion-card-title>{{ '@aoc.data.validate.title' | translate | async  }}</ion-card-title>
        </ion-card-header>
        <ion-card-content>
          <ion-grid>
            <ion-row>
              <ion-col>{{ '@aoc.data.validate.content' | translate | async }}</ion-col>
            </ion-row>
            <ion-row>
              <ion-col>
                <ion-item lines="none">
                  <bk-cat name="modelType" [value]="selectedCategory" [categories]="modelTypes" (changed)="onCategoryChange($event)" />
                </ion-item>        
              </ion-col>
              <ion-col>
                <bk-button label=" {{ '@aoc.data.validate.operation.validate' | translate | async  }}" iconName="information-circle-outline" (click)="validateModels()" />
              </ion-col>
            </ion-row>
          </ion-grid>
        </ion-card-content>
      </ion-card>

      <bk-result-log [title]="logTitle()" [log]="logInfo()" />
  </ion-content>
`
})
export class AocDataComponent {
  protected readonly aocDataStore = inject(AocDataStore);

  protected readonly logTitle = computed(() => this.aocDataStore.logTitle());
  protected readonly logInfo = computed(() => this.aocDataStore.log());
  protected readonly isLoading = computed(() => this.aocDataStore.isLoading());

  protected readonly modelTypes = ModelTypes;
  protected selectedCategory = ModelType.Person;

  protected onCategoryChange($event: number): void {
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

import { Component, computed, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonCol, IonContent, IonGrid, IonRow } from '@ionic/angular';

import { Button, Header, ResultLog } from '@okr/shared-ui';
import { AocStatisticsStore } from './aoc-statistics.store';

@Component({
  selector: 'okr-aoc-statistics',
  standalone: true,
  imports: [
    FormsModule, Header, ResultLog, Button,
    IonContent, IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonGrid, IonRow, IonCol
  ],
  providers: [AocStatisticsStore],
  template: `
    <okr-header [i18n]="{ title: aocStatisticsStore.i18n.statistics_header() }" />
    <ion-content>
      <ion-card>
        <ion-card-content>
          <ion-grid>
            <ion-row>
              <ion-col>{{ aocStatisticsStore.i18n.statistics_content() }}</ion-col>
            </ion-row>
          </ion-grid>
        </ion-card-content>
      </ion-card>
      <ion-card>
        <ion-card-header>
          <ion-card-title>{{ aocStatisticsStore.i18n.statistics_title() }}</ion-card-title>
        </ion-card-header>
        <ion-card-content>
          <ion-grid>
            <!-- Update Age by Gender -->
            <ion-row>
              <ion-col size="6">{{ aocStatisticsStore.i18n.statistics_age_by_gender_label() }}</ion-col>
              <ion-col size="6">
                <okr-button [label]="aocStatisticsStore.i18n.statistics_age_by_gender_button()" iconName="checkbox-circle" (click)="updateAgeByGender()" />
              </ion-col>
            </ion-row>
          </ion-grid>
        </ion-card-content>
      </ion-card>

      <okr-result-log [title]="logTitle()" cardTitle="Resultat" [log]="logInfo()" />
    </ion-content>
  `,
})
export class AocStatistics {
  protected readonly aocStatisticsStore = inject(AocStatisticsStore);

  protected readonly logTitle = computed(() => this.aocStatisticsStore.logTitle());
  protected readonly logInfo = computed(() => this.aocStatisticsStore.log());

  public async updateAgeByGender(): Promise<void> {
    this.aocStatisticsStore.updateAgeByGender('nyi');
  }
}

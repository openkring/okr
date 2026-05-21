import { Component, computed, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonCol, IonContent, IonGrid, IonRow } from '@ionic/angular/standalone';

import { Button, Header, ResultLog } from '@bk2/shared-ui';
import { AocStatisticsStore } from './aoc-statistics.store';

@Component({
  selector: 'bk-aoc-statistics',
  standalone: true,
  imports: [
    FormsModule, Header, ResultLog, Button,
    IonContent, IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonGrid, IonRow, IonCol
  ],
  providers: [AocStatisticsStore],
  template: `
    <bk-header [i18n]="{ title: aocStatisticsStore.i18n.statistics_header() }" />
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
            <!-- Update Competition Levels -->
            <ion-row>
              <ion-col size="6">{{ aocStatisticsStore.i18n.cl_label() }}</ion-col>
              <ion-col size="6">
                <bk-button [label]="aocStatisticsStore.i18n.cl_button()" iconName="checkbox-circle" (click)="updateCompetitionLevels()" />
              </ion-col>
            </ion-row>
            <!-- Update Competition Levels statistics -->
            <ion-row>
              <ion-col size="6">{{ aocStatisticsStore.i18n.cl_stats_label() }}</ion-col>
              <ion-col size="6">
                <bk-button [label]="aocStatisticsStore.i18n.cl_stats_button()" iconName="checkbox-circle" (click)="updateCLStatistics()" />
              </ion-col>
            </ion-row>
            <!-- Update Age by Gender -->
            <ion-row>
              <ion-col size="6">{{ aocStatisticsStore.i18n.age_by_gender_label() }}</ion-col>
              <ion-col size="6">
                <bk-button [label]="aocStatisticsStore.i18n.age_by_gender_button()" iconName="checkbox-circle" (click)="updateAgeByGender()" />
              </ion-col>
            </ion-row>
            <!-- Update Category by Gender -->
            <ion-row>
              <ion-col size="6">{{ aocStatisticsStore.i18n.cat_by_gender_label() }}</ion-col>
              <ion-col size="6">
                <bk-button [label]="aocStatisticsStore.i18n.cat_by_gender_button()" iconName="checkbox-circle" (click)="updateCategoryByGender()" />
              </ion-col>
            </ion-row>
            <!-- Update Member Location -->
            <ion-row>
              <ion-col size="6">{{ aocStatisticsStore.i18n.member_location_label() }}</ion-col>
              <ion-col size="6">
                <bk-button [label]="aocStatisticsStore.i18n.member_location_button()" iconName="checkbox-circle" (click)="updateMemberLocation()" />
              </ion-col>
            </ion-row>
          </ion-grid>
        </ion-card-content>
      </ion-card>

      <bk-result-log [title]="logTitle()" cardTitle="Resultat" [log]="logInfo()" />
    </ion-content>
  `,
})
export class AocStatistics {
  protected readonly aocStatisticsStore = inject(AocStatisticsStore);

  protected readonly logTitle = computed(() => this.aocStatisticsStore.logTitle());
  protected readonly logInfo = computed(() => this.aocStatisticsStore.log());
  protected readonly isLoading = computed(() => this.aocStatisticsStore.isLoading());

  public async updateCompetitionLevels(): Promise<void> {
    this.aocStatisticsStore.updateCompetitionLevels();
  }

  public async updateCLStatistics(): Promise<void> {
    this.aocStatisticsStore.updateCLStatistics();
  }

  public async updateAgeByGender(): Promise<void> {
    this.aocStatisticsStore.updateAgeByGender('nyi');
  }

  public async updateCategoryByGender(): Promise<void> {
    this.aocStatisticsStore.updateCategoryByGender('nyi');
  }

  public async updateMemberLocation(): Promise<void> {
    this.aocStatisticsStore.updateMemberLocation();
  }
}

import { AsyncPipe } from '@angular/common';
import { Component, computed, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonCol, IonContent, IonGrid, IonRow } from '@ionic/angular/standalone';

import { TranslatePipe } from '@bk2/shared-i18n';
import { ButtonComponent, HeaderComponent, ResultLogComponent } from '@bk2/shared-ui';
import { AocStatisticsStore } from './aoc-statistics.store';

@Component({
  selector: 'bk-aoc-statistics',
  standalone: true,
  imports: [
    TranslatePipe, AsyncPipe, 
    FormsModule, HeaderComponent, ResultLogComponent, ButtonComponent, 
    IonContent, IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonGrid, IonRow, IonCol
  ],
  providers: [AocStatisticsStore],
  template: `
    <bk-header title="@aoc.statistics.header" />
    <ion-content>
      <ion-card>
        <ion-card-content>
          <ion-grid>
            <ion-row>
              <ion-col>{{ '@aoc.statistics.content' | translate | async }}</ion-col>
            </ion-row>
          </ion-grid>
        </ion-card-content>
      </ion-card>
      <ion-card>
        <ion-card-header>
          <ion-card-title>{{ '@aoc.statistics.title' | translate | async }}</ion-card-title>
        </ion-card-header>
        <ion-card-content>
          <ion-grid>
            <!-- Update Competition Levels -->
            <ion-row>
              <ion-col size="6">{{ '@aoc.statistics.competitionLevels.label' | translate | async }}</ion-col>
              <ion-col size="6">
                <bk-button label=" {{ '@aoc.statistics.competitionLevels.button' | translate | async }}" iconName="checkbox-circle" (click)="updateCompetitionLevels()" />
              </ion-col>
            </ion-row>
            <!-- Update Competition Levels statistics -->
            <ion-row>
              <ion-col size="6">{{ '@aoc.statistics.clStats.label' | translate | async }}</ion-col>
              <ion-col size="6">
                <bk-button label="{{ '@aoc.statistics.clStats.button' | translate | async }}" iconName="checkbox-circle" (click)="updateCLStatistics()" />
              </ion-col>
            </ion-row>
            <!-- Update Age by Gender -->
            <ion-row>
              <ion-col size="6">{{ '@aoc.statistics.ageByGender.label' | translate | async }}</ion-col>
              <ion-col size="6">
                <bk-button label="{{ '@aoc.statistics.ageByGender.button' | translate | async }}" iconName="checkbox-circle" (click)="updateAgeByGender()" />
              </ion-col>
            </ion-row>
            <!-- Update Category by Gender -->
            <ion-row>
              <ion-col size="6">{{ '@aoc.statistics.categoryByGender.label' | translate | async }}</ion-col>
              <ion-col size="6">
                <bk-button label="{{ '@aoc.statistics.categoryByGender.button' | translate | async }}" iconName="checkbox-circle" (click)="updateCategoryByGender()" />
              </ion-col>
            </ion-row>
            <!-- Update Member Location -->
            <ion-row>
              <ion-col size="6">{{ '@aoc.statistics.memberLocation.label' | translate | async }}</ion-col>
              <ion-col size="6">
                <bk-button label="{{ '@aoc.statistics.memberLocation.button' | translate | async }}" iconName="checkbox-circle" (click)="updateMemberLocation()" />
              </ion-col>
            </ion-row>
          </ion-grid>
        </ion-card-content>
      </ion-card>

      <bk-result-log [title]="logTitle()" [log]="logInfo()" />
    </ion-content>
  `,
})
export class AocStatisticsComponent {
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

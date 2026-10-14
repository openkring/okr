import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonCol, IonContent, IonGrid, IonLabel, IonRow } from '@ionic/angular';

import { Button, Header, ResultLog, StringSelect, StringSelectI18n } from '@okr/shared-ui';

import { AocAdminOpsStore } from './aoc-adminops.store';

@Component({
  selector: 'okr-aoc-adminops',
  standalone: true,
  imports: [
    Header, Button, ResultLog, StringSelect,
    IonContent, IonCardHeader, IonCardTitle, IonCardContent, IonCard, IonGrid, IonRow, IonCol, IonLabel,
    FormsModule
  ],
  providers: [AocAdminOpsStore],
  template: `
    <okr-header [i18n]="{ title: adminOpsTitle() }" />
    <ion-content>
      <ion-card>
        <ion-card-header>
          <ion-card-title>{{ store.i18n.adminops_title() }}</ion-card-title>
        </ion-card-header>
        <ion-card-content>
          <ion-grid>
            <!-- IBAN -->
            <ion-row>
              <ion-col size="6">{{ store.i18n.adminops_iban_label() }}</ion-col>
              <ion-col size="6">
                <okr-button label=" {{ store.i18n.adminops_iban_button() }}" iconName="checkbox-circle" (click)="listIban()" />
              </ion-col>
            </ion-row>
            <!-- Old Juniors -->
            <ion-row>
              <ion-col size="6">{{ store.i18n.adminops_oldJuniors_label() }}</ion-col>
              <ion-col size="6">
                <okr-button label=" {{ store.i18n.adminops_oldJuniors_button() }}" iconName="checkbox-circle" (click)="listOldJuniors()" />
              </ion-col>
            </ion-row>
            <ion-row>
              <ion-col><ion-label>"{{ store.i18n.adminops_mcatchange_title() }}"</ion-label></ion-col>
            </ion-row>
            <ion-row>
              <ion-col size="6">
                <okr-string-select [i18n]="clubI18n()" [selectedString]="club()" (selectedStringChange)="onFieldChange('club', $event)" [readOnly]="false" [stringList]="['scs', 'srv']" />
              </ion-col>
              <ion-col size="6">      
                <okr-string-select [i18n]="yearI18n()" [selectedString]="year()" (selectedStringChange)="onFieldChange('year', $event)" [readOnly]="false" [stringList]="['2026', '2025', '2024', '2023', '2022', '2021']" />           
              </ion-col>
              <ion-col size="6">
              </ion-col>
              <ion-col size="6">
                <okr-button [label]="store.i18n.adminops_mcatchange_button()" iconName="checkbox-circle" (click)="showMembershipCategoryChanges()" />
              </ion-col>
            </ion-row>
            <!-- accountTenants backfill: one-off maintenance, see AocAdminOpsStore.backfillAccountTenants -->
            <ion-row>
              <ion-col><ion-label>{{ store.i18n.adminops_hasaccount_title() }}</ion-label></ion-col>
            </ion-row>
            <ion-row>
              <ion-col size="6">{{ store.i18n.adminops_hasaccount_label() }}</ion-col>
              <ion-col size="6">
                <okr-button [label]="store.i18n.adminops_hasaccount_button()" iconName="checkbox-circle" (click)="backfillAccountTenants()" />
              </ion-col>
            </ion-row>
            <!-- Find orphaned sections -->
          </ion-grid>
        </ion-card-content>
      </ion-card>

      <okr-result-log [cardTitle]="store.i18n.result_title()" [title]="logTitle()" [log]="logInfo()" />
    </ion-content>
  `,
})
export class AocAdminOps {
  protected readonly store = inject(AocAdminOpsStore);

  // derived
  protected readonly logTitle = computed(() => this.store.logTitle());
  protected readonly logInfo = computed(() => this.store.log());
  protected readonly isLoading = computed(() => this.store.isLoading());
  protected readonly adminOpsTitle = computed(() => this.store.i18n.adminops_title());

  protected clubI18n = computed(() => ({ name: 'club', label: this.store.i18n.adminops_club_label() } as StringSelectI18n));
  protected yearI18n = computed(() => ({ name: 'year', label: this.store.i18n.adminops_year_label() } as StringSelectI18n));

  // signals
  protected club = signal('scs');
  protected year = signal('2025');

  public listIban(): void {
    this.store.listIban();
  }

  public listOldJuniors(): void {
    this.store.listJuniorsOlderThan();
  }

  public showMembershipCategoryChanges(): void {
    this.store.setModelType('membership');
    this.store.showMembershipCategoryChanges(this.club(), parseInt(this.year(), 10));
  }

  public backfillAccountTenants(): void {
    void this.store.backfillAccountTenants();
  }

  protected onFieldChange(fieldName: string, $event: string): void {
    if (fieldName === 'club') {
      this.club.set($event);
    } else if (fieldName === 'year') {
      this.year.set($event);
    }
  }
}

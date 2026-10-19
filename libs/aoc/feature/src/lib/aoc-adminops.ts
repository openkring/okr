import { Component, computed, inject } from '@angular/core';
import { IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonCol, IonContent, IonGrid, IonLabel, IonRow } from '@ionic/angular';

import { Button, Header, ResultLog } from '@okr/shared-ui';

import { AocAdminOpsStore } from './aoc-adminops.store';

@Component({
  selector: 'okr-aoc-adminops',
  standalone: true,
  imports: [
    Header, Button, ResultLog,
    IonContent, IonCardHeader, IonCardTitle, IonCardContent, IonCard, IonGrid, IonRow, IonCol, IonLabel
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
  protected readonly adminOpsTitle = computed(() => this.store.i18n.adminops_title());

  public listIban(): void {
    this.store.listIban();
  }

  public backfillAccountTenants(): void {
    void this.store.backfillAccountTenants();
  }
}

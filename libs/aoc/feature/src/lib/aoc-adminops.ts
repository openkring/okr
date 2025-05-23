import { Component, computed, inject } from "@angular/core";
import { IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonCol, IonContent, IonGrid, IonRow } from "@ionic/angular/standalone";
import { AsyncPipe } from "@angular/common";
import { FormsModule } from "@angular/forms";

import { TranslatePipe } from "@bk2/shared/i18n";
import { ButtonComponent, HeaderComponent, ResultLogComponent } from "@bk2/shared/ui";

import { AocAdminOpsStore } from "./aoc-adminops.store";

@Component({
  selector: 'bk-aoc-adminops',
  standalone: true,
  imports: [
    TranslatePipe, AsyncPipe,
    HeaderComponent, ButtonComponent, ResultLogComponent,
    IonContent, IonCardHeader, IonCardTitle, IonCardContent, IonCard,
    IonGrid, IonRow, IonCol,
    FormsModule
  ],
  providers: [AocAdminOpsStore],
  template: `
    <bk-header title="{{ '@aoc.title' | translate | async }}" />
    <ion-content>
      <ion-card>
        <ion-card-header>
          <ion-card-title>{{ '@aoc.adminops.title' | translate | async }}</ion-card-title>
        </ion-card-header>
        <ion-card-content>
          <ion-grid>
            <!-- IBAN -->
            <ion-row>
              <ion-col size="6">{{ '@aoc.adminops.iban.label' | translate | async  }}</ion-col>
              <ion-col size="6">
                <bk-button label=" {{ '@aoc.adminops.iban.button' | translate | async }}" iconName="checkmark-circle-outline" (click)="listIban()" />
              </ion-col>
            </ion-row>
            <!-- Old Juniors -->
            <ion-row>
              <ion-col size="6">{{ '@aoc.adminops.oldJuniors.label' | translate | async  }}</ion-col>
              <ion-col size="6">
                <bk-button label=" {{ '@aoc.adminops.oldJuniors.button' | translate | async  }}" iconName="checkmark-circle-outline" (click)="listOldJuniors()" />
              </ion-col>
            </ion-row>
            <!-- Membership Prices -->
            <ion-row>
              <ion-col size="6">{{ '@aoc.adminops.membershipPrices.label' | translate | async  }}</ion-col>
              <ion-col size="6">
                <bk-button label=" {{ '@aoc.adminops.membershipPrices.button' | translate | async  }}" iconName="checkmark-circle-outline" (click)="updateMembershipPrices()" />
              </ion-col>
            </ion-row>
            <!-- Membership Attributes -->
            <ion-row>
              <ion-col size="6">{{ '@aoc.adminops.membershipAttributes.label' | translate | async  }}</ion-col>
              <ion-col size="6">
                <bk-button label=" {{ '@aoc.adminops.membershipAttributes.button' | translate | async  }}" iconName="checkmark-circle-outline" (click)="updateMembershipAttributes()" />
              </ion-col>
            </ion-row>
            <!-- Check entry date for juniors -->
            <ion-row>
              <ion-col size="6">{{ '@aoc.adminops.checkJuniorEntry.label' | translate | async  }}</ion-col>
            </ion-row>
            <ion-row>
              <ion-col size="6">{{ '@aoc.adminops.checkJuniorEntry.description' | translate | async  }}</ion-col>
              <ion-col size="6">
                <bk-button label=" {{ '@aoc.adminops.checkJuniorEntry.button' | translate | async  }}" iconName="checkmark-circle-outline" (click)="checkJuniorEntry()" />
              </ion-col>
            </ion-row>
            <!-- Find orphaned sections -->

          </ion-grid>
        </ion-card-content>
      </ion-card>

      <bk-result-log [title]="logTitle()" [log]="logInfo()" />
    </ion-content>
  `
})
export class AocAdminOpsComponent {
  private readonly aocAdminOpsStore = inject(AocAdminOpsStore);

  protected readonly logTitle = computed(() => this.aocAdminOpsStore.logTitle());
  protected readonly logInfo = computed(() => this.aocAdminOpsStore.log());
  protected readonly isLoading = computed(() => this.aocAdminOpsStore.isLoading());

  public listIban(): void {
    this.aocAdminOpsStore.listIban();
  }

  public listOldJuniors(): void {
    this.aocAdminOpsStore.listJuniorsOlderThan();
  }

  public updateMembershipPrices(): void {
    this.aocAdminOpsStore.updateMembershipPrices();
  }

  public updateMembershipAttributes(): void {
    this.aocAdminOpsStore.updateMembershipAttributes();
  }

  public checkJuniorEntry(): void {
    this.aocAdminOpsStore.checkJuniorEntry();
  }
}

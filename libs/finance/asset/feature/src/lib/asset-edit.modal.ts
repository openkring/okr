import { Component, computed, inject, input, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { IonButton, IonButtons, IonContent, IonHeader, IonInput, IonItem, IonLabel, IonSelect, IonSelectOption, IonTitle, IonToolbar } from '@ionic/angular/standalone';

import { AssetCategoryModel, AssetModel, UserModel } from '@okr/shared-models';
import { dismissOverlay } from '@okr/shared-util-angular';
import { CostCenterStore } from '@okr/finance-cost-center-feature';
import { CostCenterSelect, CostCenterSelectI18n } from '@okr/finance-cost-center-ui';
import { AssetStore } from './asset.store';

@Component({
  selector: 'okr-asset-edit-modal',
  standalone: true,
  imports: [FormsModule, IonHeader, IonToolbar, IonTitle, IonButtons, IonButton, IonContent, IonItem, IonLabel, IonInput, IonSelect, IonSelectOption, CostCenterSelect],
  providers: [AssetStore],
  template: `
    <ion-header>
      <ion-toolbar>
        <ion-title>{{ readOnly() ? store.i18n.view() : (asset().okey ? store.i18n.update() : store.i18n.create()) }}</ion-title>
        <ion-buttons slot="end">
          <ion-button (click)="dismiss()">{{ store.i18n.cancel() }}</ion-button>
          @if (!readOnly()) { <ion-button (click)="save()">{{ store.i18n.save() }}</ion-button> }
        </ion-buttons>
      </ion-toolbar>
    </ion-header>
    <ion-content>
      <ion-item>
        <ion-label position="stacked">{{ store.i18n.name() }}</ion-label>
        <ion-input [(ngModel)]="edit.name" [readonly]="readOnly()" />
      </ion-item>
      <ion-item>
        <ion-label position="stacked">{{ store.i18n.number() }}</ion-label>
        <ion-input [(ngModel)]="edit.assetNo" [readonly]="readOnly()" />
      </ion-item>
      <ion-item>
        <ion-label position="stacked">{{ store.i18n.category() }}</ion-label>
        <ion-select [(ngModel)]="edit.categoryKey" [disabled]="readOnly()">
          @for (cat of categories(); track cat.okey) {
            <ion-select-option [value]="cat.okey">{{ cat.name }}</ion-select-option>
          }
        </ion-select>
      </ion-item>
      <ion-item>
        <ion-label position="stacked">{{ store.i18n.acquisition_date() }}</ion-label>
        <ion-input [(ngModel)]="edit.acquisitionDate" [readonly]="readOnly()" />
      </ion-item>
      <ion-item>
        <ion-label position="stacked">{{ store.i18n.life() }}</ion-label>
        <ion-input type="number" [(ngModel)]="edit.usefulLifeMonths" [readonly]="readOnly()" />
      </ion-item>
      @if (costCenterStore.isEnabled()) {
        <okr-cost-center-select [i18n]="costCenterI18n()" [costCenters]="costCenterStore.costCenters()" [allowEmpty]="true" [emptyIsFallback]="true"
          [(selectedKey)]="edit.costCenter" [readOnly]="readOnly()" />
      }
    </ion-content>
  `,
})
export class AssetEditModal implements OnInit {
  protected readonly store = inject(AssetStore);

  // inputs
  public readonly asset = input.required<AssetModel>();
  public readonly categories = input<AssetCategoryModel[]>([]);
  public readonly readOnly = input<boolean>(true);
  public readonly currentUser = input<UserModel | undefined>(undefined);

  protected readonly costCenterStore = inject(CostCenterStore);
  protected readonly costCenterI18n = computed(() => ({ name: 'costCenter', label: this.store.i18n.cost_center() } as CostCenterSelectI18n));

  protected edit!: AssetModel;

  public ngOnInit(): void { this.edit = { ...this.asset() }; }

  protected async dismiss(): Promise<void> { await dismissOverlay(this.store.modalController, null, 'cancel'); }
  protected async save(): Promise<void> { await dismissOverlay(this.store.modalController, this.edit, 'confirm'); }
}

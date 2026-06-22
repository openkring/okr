import { Component, inject, input, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { IonButton, IonButtons, IonContent, IonHeader, IonInput, IonItem, IonLabel, IonSelect, IonSelectOption, IonTitle, IonToolbar } from '@ionic/angular/standalone';

import { AssetCategoryModel, AssetModel, UserModel } from '@bk2/shared-models';
import { AssetStore } from './asset.store';

@Component({
  selector: 'bk-asset-edit-modal',
  standalone: true,
  imports: [FormsModule, IonHeader, IonToolbar, IonTitle, IonButtons, IonButton, IonContent, IonItem, IonLabel, IonInput, IonSelect, IonSelectOption],
  template: `
    <ion-header>
      <ion-toolbar>
        <ion-title>{{ readOnly() ? store.i18n.view() : (asset().bkey ? store.i18n.update() : store.i18n.create()) }}</ion-title>
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
          @for (cat of categories(); track cat.bkey) {
            <ion-select-option [value]="cat.bkey">{{ cat.name }}</ion-select-option>
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

  protected edit!: AssetModel;

  public ngOnInit(): void { this.edit = { ...this.asset() }; }

  protected async dismiss(): Promise<void> { await this.store.modalController.dismiss(null, 'cancel'); }
  protected async save(): Promise<void> { await this.store.modalController.dismiss(this.edit, 'confirm'); }
}

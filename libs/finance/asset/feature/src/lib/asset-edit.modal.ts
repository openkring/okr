import { Component, inject, input, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ModalController, IonButton, IonButtons, IonContent, IonHeader,
  IonInput, IonItem, IonLabel, IonSelect, IonSelectOption, IonTitle, IonToolbar } from '@ionic/angular/standalone';

import { AssetCategoryModel, AssetModel, UserModel } from '@bk2/shared-models';

@Component({
  selector: 'bk-asset-edit-modal',
  standalone: true,
  imports: [FormsModule, IonHeader, IonToolbar, IonTitle, IonButtons, IonButton, IonContent, IonItem, IonLabel, IonInput, IonSelect, IonSelectOption],
  template: `
    <ion-header>
      <ion-toolbar>
        <ion-title>{{ readOnly() ? 'View Asset' : (asset().bkey ? 'Edit Asset' : 'New Asset') }}</ion-title>
        <ion-buttons slot="end">
          <ion-button (click)="dismiss()">Cancel</ion-button>
          @if (!readOnly()) { <ion-button (click)="save()">Save</ion-button> }
        </ion-buttons>
      </ion-toolbar>
    </ion-header>
    <ion-content>
      <ion-item>
        <ion-label position="stacked">Name</ion-label>
        <ion-input [(ngModel)]="edit.name" [readonly]="readOnly()" />
      </ion-item>
      <ion-item>
        <ion-label position="stacked">Asset No.</ion-label>
        <ion-input [(ngModel)]="edit.assetNo" [readonly]="readOnly()" />
      </ion-item>
      <ion-item>
        <ion-label position="stacked">Category</ion-label>
        <ion-select [(ngModel)]="edit.categoryKey" [disabled]="readOnly()">
          @for (cat of categories(); track cat.bkey) {
            <ion-select-option [value]="cat.bkey">{{ cat.name }}</ion-select-option>
          }
        </ion-select>
      </ion-item>
      <ion-item>
        <ion-label position="stacked">Acquisition Date (YYYYMMDD)</ion-label>
        <ion-input [(ngModel)]="edit.acquisitionDate" [readonly]="readOnly()" />
      </ion-item>
      <ion-item>
        <ion-label position="stacked">Useful Life (months)</ion-label>
        <ion-input type="number" [(ngModel)]="edit.usefulLifeMonths" [readonly]="readOnly()" />
      </ion-item>
    </ion-content>
  `,
})
export class AssetEditModal implements OnInit {
  public readonly asset = input.required<AssetModel>();
  public readonly categories = input<AssetCategoryModel[]>([]);
  public readonly readOnly = input<boolean>(true);
  public readonly currentUser = input<UserModel | undefined>(undefined);

  private readonly modalController = inject(ModalController);
  protected edit!: AssetModel;

  public ngOnInit(): void { this.edit = { ...this.asset() }; }

  protected async dismiss(): Promise<void> { await this.modalController.dismiss(null, 'cancel'); }
  protected async save(): Promise<void> { await this.modalController.dismiss(this.edit, 'confirm'); }
}

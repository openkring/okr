import { Component, computed, inject, input } from "@angular/core";
import { IonButton, IonCol, IonContent, IonGrid, IonLabel, IonRow, ModalController } from "@ionic/angular/standalone";

import { UserModel } from "@bk2/shared-models";
import { HeaderComponent, SpinnerComponent } from "@bk2/shared-ui";

import { BexioIndex } from "..";
import { getFullName } from "@bk2/shared-util-core";

type SyncStatus = 'in-sync' | 'update' | 'create' | 'bexio-only' | 'both-empty';

@Component({
  selector: 'bk-aoc-bexio-contact-edit-modal',
  standalone: true,
  imports: [
    HeaderComponent, SpinnerComponent,
    IonContent, IonGrid, IonRow, IonCol, IonButton, IonLabel
  ],
  styles: [`
    .table-header { font-size: 1.2rem; background-color: var(--ion-color-light); }
    .mismatch { background-color: var(--ion-color-danger-tint); }
    .sync-row { margin-top: 1rem; }
  `],
  template: `
    <bk-header title="@aoc.bexio.index.title" [isModal]="true" />
    <ion-content class="ion-no-padding">
      @if(bexioIndex(); as bx) {
      <ion-grid>
        <ion-row class="table-header"> <!-- header -->
          <ion-col size="4"><strong>Person/Org</strong></ion-col>
          <ion-col size="4"><strong>Membership</strong></ion-col>
          <ion-col size="4"><strong>Bexio</strong></ion-col>
        </ion-row>
        <ion-row> <!-- sync key -->
          <ion-col size="4">sync-key:</ion-col>
          <ion-col size="8">{{bx.key}}</ion-col>
        </ion-row>
        <ion-row> <!-- bkey -->
          <ion-col size="4">{{bx.bkey}}</ion-col>
          <ion-col size="4">{{bx.mkey}}</ion-col>
          <ion-col size="4">{{bx.bx_id}}</ion-col>
        </ion-row>
        <ion-row> <!-- name -->
          <ion-col size="4">{{name()}}</ion-col>
          <ion-col size="4">{{bx.type}}</ion-col>
          <ion-col size="4" [class.mismatch]="nameMismatch()">-{{bx_name()}}-</ion-col>
        </ion-row>
        <ion-row> <!-- bexioId -->
          <ion-col size="4">-{{bx.bexioId}}-</ion-col>
          <ion-col size="4">{{bx.mbexioId}}</ion-col>
          <ion-col size="4">-{{bx.bx_id}}-</ion-col>
        </ion-row>
        <ion-row> <!-- street -->
          <ion-col size="4">-{{street()}}-</ion-col>
          <ion-col size="4"></ion-col>
          <ion-col size="4" [class.mismatch]="streetMismatch()">-{{bx_street()}}-</ion-col>
        </ion-row>
        <ion-row> <!-- zip/city -->
          <ion-col size="4">-{{zipCity()}}-</ion-col>
          <ion-col size="4"></ion-col>
          <ion-col size="4" [class.mismatch]="zipCityMismatch()">-{{bx_zipCity()}}-</ion-col>
        </ion-row>
        <ion-row> <!-- email -->
          <ion-col size="4">-{{bx.email}}-</ion-col>
          <ion-col size="4"></ion-col>
          <ion-col size="4" [class.mismatch]="emailMismatch()">-{{bx.bx_email}}-</ion-col>
        </ion-row>

        <!-- sync action row -->
        <ion-row class="sync-row">
          <ion-col size="12">
            @switch(syncStatus()) {
              @case('in-sync') {
                <ion-label color="success"><strong>Sync is ok</strong></ion-label>
              }
              @case('update') {
                <ion-button color="warning" (click)="dismiss('update')">Update an existing Bexio Contact</ion-button>
              }
              @case('create') {
                <ion-button color="primary" (click)="dismiss('create')">Create a contact in Bexio</ion-button>
              }
              @case('bexio-only') {
                  <ion-button color="primary" (click)="dismiss('download')">Download Bexio Contact to the App</ion-button>
                <ion-label color="danger">
                  This contact exists only in Bexio. BE CAREFUL: only apply this function when you are sure that there is no corresponding person or org in the app already.
                </ion-label>
              }
              @case('both-empty') {
                <ion-label color="danger">
                  Both contacts are empty - this should not happen in theory. Check this manually.
                </ion-label>
              }
            }
          </ion-col>
        </ion-row>
      </ion-grid>
      } @else {
        <bk-spinner />
      }
    </ion-content>
  `
})
export class AocBexioContactEditModal {

  private readonly modalController = inject(ModalController);

  // inputs
  public bexioIndex = input.required<BexioIndex>();
  public currentUser = input<UserModel | undefined>();
  public tenantId = input.required<string>();

  // derived signals
  protected name = computed(() => getFullName(this.bexioIndex().name1, this.bexioIndex().name2));
  protected bx_name = computed(() => getFullName(this.bexioIndex().bx_name1, this.bexioIndex().bx_name2));
  protected street = computed(() => this.bexioIndex().streetName + ' ' + this.bexioIndex().streetNumber);
  protected bx_street = computed(() => this.bexioIndex().bx_streetName + ' ' + this.bexioIndex().bx_streetNumber);
  protected zipCity = computed(() => this.bexioIndex().zipCode + ' ' + this.bexioIndex().city);
  protected bx_zipCity = computed(() => this.bexioIndex().bx_zipCode + ' ' + this.bexioIndex().bx_city);

  // Normalise: trim whitespace and treat null/undefined as empty string for comparison
  private norm(v: string | null | undefined): string { return (v ?? '').trim(); }

  protected nameMismatch = computed(() => {
    const bx = this.bexioIndex();
    return this.norm(bx.name1) !== this.norm(bx.bx_name1) || this.norm(bx.name2) !== this.norm(bx.bx_name2);
  });
  protected bexioIdMismatch = computed(() => this.norm(this.bexioIndex().bexioId) !== this.norm(this.bexioIndex().bx_id));
  protected streetMismatch = computed(() => {
    const bx = this.bexioIndex();
    return this.norm(bx.streetName) !== this.norm(bx.bx_streetName) || this.norm(bx.streetNumber) !== this.norm(bx.bx_streetNumber);
  });
  protected zipCityMismatch = computed(() => {
    const bx = this.bexioIndex();
    return this.norm(bx.zipCode) !== this.norm(bx.bx_zipCode) || this.norm(bx.city) !== this.norm(bx.bx_city);
  });
  protected emailMismatch = computed(() => this.norm(this.bexioIndex().email) !== this.norm(this.bexioIndex().bx_email));

  protected syncStatus = computed<SyncStatus>(() => {
    const bx = this.bexioIndex();
    const hasBk = !!bx.bkey;
    const hasBexio = !!bx.bx_id;

    if (!hasBk && hasBexio) return 'bexio-only';
    if (hasBk && !hasBexio) return 'create';
    if (hasBk && hasBexio) {
      const hasMismatch = this.nameMismatch() || this.streetMismatch() || this.zipCityMismatch() || this.emailMismatch();
      return hasMismatch ? 'update' : 'in-sync';
    }
    return 'both-empty'; // both empty — should not happen in practice
  });

  /******************************* actions *************************************** */

  protected async dismiss(role: 'create' | 'update' | 'cancel' | 'download'): Promise<void> {
    await this.modalController.dismiss(null, role);
  }
}

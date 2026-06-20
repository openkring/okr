import { Component, computed, inject, input } from "@angular/core";
import { IonButton, IonCol, IonContent, IonGrid, IonLabel, IonRow, ModalController } from "@ionic/angular/standalone";

import { UserModel } from "@bk2/shared-models";
import { Header, Spinner } from "@bk2/shared-ui";
import { I18nService } from "@bk2/shared-i18n";
import { AOC_I18N_KEYS } from "@bk2/aoc-util";

import { BexioIndex } from "..";
import { getFullName } from "@bk2/shared-util-core";

type SyncStatus = 'in-sync' | 'update' | 'create' | 'bexio-only' | 'both-empty';

@Component({
  selector: 'bk-aoc-bexio-contact-edit-modal',
  standalone: true,
  imports: [
    Header, Spinner,
    IonContent, IonGrid, IonRow, IonCol, IonButton, IonLabel
  ],
  styles: [`
    .table-header { font-size: 1.2rem; background-color: var(--ion-color-light); }
    .row-label { background-color: var(--ion-color-light); font-weight: bold; }
    .mismatch { background-color: var(--ion-color-danger-tint); }
    .sync-row { margin-top: 1rem; }
  `],
  template: `
    <bk-header [i18n]="{ title: i18n.title()}" [isModal]="true" />
    <ion-content class="ion-no-padding">
      @if(bexioIndex(); as bx) {
      <ion-grid>
        <ion-row class="table-header"> <!-- header -->
          <ion-col size="3"><strong>Quelle</strong></ion-col>
          <ion-col size="3"><strong>{{ effectiveType() }}</strong></ion-col>
          <ion-col size="3"><strong>Membership</strong></ion-col>
          <ion-col size="3"><strong>Bexio</strong></ion-col>
        </ion-row>
        <ion-row> <!-- key -->
          <ion-col size="3" class="row-label">Key</ion-col>
          <ion-col size="3">{{bx.bkey}}</ion-col>
          <ion-col size="3">{{bx.mkey}}</ion-col>
          <ion-col size="3">{{bx.bx_id}}</ion-col>
        </ion-row>
        <ion-row> <!-- name -->
          <ion-col size="3" class="row-label">Name</ion-col>
          <ion-col size="3">{{name()}}</ion-col>
          <ion-col size="3">{{bx.mname}}</ion-col>
          <ion-col size="3" [class.mismatch]="nameMismatch()">{{bx_name()}}</ion-col>
        </ion-row>
        <ion-row> <!-- type -->
          <ion-col size="3" class="row-label">Type</ion-col>
          <ion-col size="3">{{bx.type}}</ion-col>
          <ion-col size="3">{{bx.memberModelType}}</ion-col>
          <ion-col size="3">{{bx.bx_type}}</ion-col>
        </ion-row>
        <ion-row> <!-- bexioId -->
          <ion-col size="3" class="row-label">BexioId</ion-col>
          <ion-col size="3">{{bx.bexioId}}</ion-col>
          <ion-col size="3">{{bx.mbexioId}}</ion-col>
          <ion-col size="3">{{bx.bx_id}}</ion-col>
        </ion-row>
        <ion-row> <!-- street -->
          <ion-col size="3" class="row-label">Strasse</ion-col>
          <ion-col size="3">{{street()}}</ion-col>
          <ion-col size="3"></ion-col>
          <ion-col size="3" [class.mismatch]="streetMismatch()">{{bx_street()}}</ion-col>
        </ion-row>
        <ion-row> <!-- zip/city -->
          <ion-col size="3" class="row-label">Ort</ion-col>
          <ion-col size="3">{{zipCity()}}</ion-col>
          <ion-col size="3"></ion-col>
          <ion-col size="3" [class.mismatch]="zipCityMismatch()">{{bx_zipCity()}}</ion-col>
        </ion-row>
        <ion-row> <!-- email -->
          <ion-col size="3" class="row-label">Email</ion-col>
          <ion-col size="3">{{bx.email}}</ion-col>
          <ion-col size="3"></ion-col>
          <ion-col size="3" [class.mismatch]="emailMismatch()">{{bx.bx_email}}</ion-col>
        </ion-row>
        <ion-row> <!-- tel -->
          <ion-col size="3" class="row-label">Tel</ion-col>
          <ion-col size="3">{{bx.phone}}</ion-col>
          <ion-col size="3"></ion-col>
          <ion-col size="3" [class.mismatch]="phoneMismatch()">{{bx.bx_phone}}</ion-col>
        </ion-row>

        <!-- edit BK records row: edit person/org under Person/Org, edit membership under Membership -->
        <ion-row class="sync-row">
          <ion-col size="3"></ion-col>
          <ion-col size="3">
            @if(bx.bkey) {
              @if(bx.type === 'person') {
                <ion-button fill="outline" (click)="dismiss('editPerson')">{{ i18n.bexio_edit_person() }}</ion-button>
              } @else {
                <ion-button fill="outline" (click)="dismiss('editOrg')">{{ i18n.bexio_edit_org() }}</ion-button>
              }
            }
          </ion-col>
          <ion-col size="3">
            @if(bx.mkey) {
              <ion-button fill="outline" (click)="dismiss('editMembership')">{{ i18n.bexio_edit_membership() }}</ion-button>
            }
          </ion-col>
          <ion-col size="3"></ion-col>
        </ion-row>

        <!-- sync action row: BK-modifying actions under Person/Org, Bexio-modifying actions under Bexio -->
        <ion-row class="sync-row">
          <ion-col size="3"></ion-col>
          <ion-col size="3">
            @if(showDownload()) {
              <ion-button fill="outline" (click)="dismiss('download')">Download Bexio Contact to the App</ion-button>
            }
            @if(showUpdateBk()) {
              <ion-button fill="outline" (click)="dismiss('updateBk')">Update BK Contact</ion-button>
            }
          </ion-col>
          <ion-col size="3"></ion-col>
          <ion-col size="3">
            @if(showCreate()) {
              <ion-button fill="outline" (click)="dismiss('create')">Create a contact in Bexio</ion-button>
            }
            @if(showUpdateBexio()) {
              <ion-button fill="outline" (click)="dismiss('update')">Update Bexio Contact</ion-button>
            }
          </ion-col>
        </ion-row>
        @if(syncStatus() === 'in-sync') {
          <ion-row><ion-col size="12"><ion-label color="success"><strong>Sync is ok</strong></ion-label></ion-col></ion-row>
        }
        @if(syncStatus() === 'bexio-only') {
          <ion-row><ion-col size="12"><ion-label color="danger">
            This contact exists only in Bexio. BE CAREFUL: only apply this function when you are sure that there is no corresponding person or org in the app already.
          </ion-label></ion-col></ion-row>
        }
        @if(syncStatus() === 'both-empty') {
          <ion-row><ion-col size="12"><ion-label color="danger">
            Both contacts are empty - this should not happen in theory. Check this manually.
          </ion-label></ion-col></ion-row>
        }
      </ion-grid>
      } @else {
        <bk-spinner />
      }
    </ion-content>
  `
})
export class AocBexioContactEditModal {
  private readonly modalController = inject(ModalController);
  private readonly i18nService = inject(I18nService);

  protected readonly i18n = this.i18nService.translateAll(AOC_I18N_KEYS);

  // inputs
  public bexioIndex = input.required<BexioIndex>();
  public currentUser = input<UserModel | undefined>();
  public tenantId = input.required<string>();

  // derived signals
  protected effectiveType = computed(() => this.bexioIndex().type === 'person' ? 'Person' : 'Organisation');
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
  // informational only — phone number formats differ between BK and Bexio, so it is NOT part of anyMismatch
  protected phoneMismatch = computed(() => this.norm(this.bexioIndex().phone) !== this.norm(this.bexioIndex().bx_phone));

  protected anyMismatch = computed(() => this.nameMismatch() || this.streetMismatch() || this.zipCityMismatch() || this.emailMismatch());
  // Bexio holds address data for this contact (street/zip/city/email)
  protected bexioHasAddress = computed(() => {
    const bx = this.bexioIndex();
    return !!(this.norm(bx.bx_streetName) || this.norm(bx.bx_zipCode) || this.norm(bx.bx_city) || this.norm(bx.bx_email));
  });

  // BK-modifying actions (shown under the Person/Org column)
  protected showDownload = computed(() => !this.bexioIndex().bkey && !!this.bexioIndex().bx_id);
  protected showUpdateBk = computed(() => !!this.bexioIndex().bkey && !!this.bexioIndex().bx_id && this.anyMismatch() && this.bexioHasAddress());
  // Bexio-modifying actions (shown under the Bexio column)
  protected showCreate = computed(() => !!this.bexioIndex().bkey && !this.bexioIndex().bx_id);
  protected showUpdateBexio = computed(() => !!this.bexioIndex().bkey && !!this.bexioIndex().bx_id && this.anyMismatch());

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

  protected async dismiss(role: 'create' | 'update' | 'updateBk' | 'cancel' | 'download' | 'editPerson' | 'editOrg' | 'editMembership'): Promise<void> {
    await this.modalController.dismiss(null, role);
  }
}

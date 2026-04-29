import { Component, computed, inject, input } from '@angular/core';
import { IonButton, IonButtons, IonCol, IonContent, IonGrid, IonHeader, IonRow, IonTitle, IonToolbar, ModalController } from '@ionic/angular/standalone';

import { SrvIndex } from '@bk2/shared-models';
import { getMismatches } from '@bk2/shared-util-core';

interface SrvDisplayRow {
  attr:      string;
  person:    string;
  member:    string;
  regasoft:  string;
  mismatch:  boolean;
}

@Component({
  selector: 'bk-aoc-srv-mismatch-modal',
  standalone: true,
  imports: [
    IonHeader, IonToolbar, IonTitle, IonButtons, IonButton,
    IonContent, IonGrid, IonRow, IonCol,
  ],
  styles: [`
    .mismatch { color: var(--ion-color-danger); font-weight: 500; }
    ion-row { border-bottom: 1px solid var(--ion-color-light); }
  `],
  template: `
    <ion-header>
      <ion-toolbar color="warning">
        <ion-title>Vergleich: {{ item().firstName }} {{ item().lastName }}</ion-title>
        <ion-buttons slot="end">
          <ion-button (click)="close()">Schliessen</ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>
    <ion-content class="ion-padding">
      <ion-grid>
        <ion-row>
          <ion-col size="3"><strong>Attribut</strong></ion-col>
          <ion-col size="3"><strong>Person</strong></ion-col>
          <ion-col size="3"><strong>Mitglied</strong></ion-col>
          <ion-col size="3"><strong>Regasoft</strong></ion-col>
        </ion-row>
        @for(row of rows(); track row.attr) {
          <ion-row [class.mismatch]="row.mismatch">
            <ion-col size="3">{{ row.attr }}</ion-col>
            <ion-col size="3">{{ row.person || '—' }}</ion-col>
            <ion-col size="3">{{ row.member || '—' }}</ion-col>
            <ion-col size="3">{{ row.regasoft || '—' }}</ion-col>
          </ion-row>
        }
      </ion-grid>
    </ion-content>
  `,
})
export class AocSrvMismatchModal {
  private readonly modalController = inject(ModalController);

  public item = input.required<SrvIndex>();

  protected rows = computed<SrvDisplayRow[]>(() => {
    const i = this.item();
    const mismatches = new Set(getMismatches(i).map(m => m.field));
    const has = (field: string) => mismatches.has(field);

    const memberKey = [i.mKey, i.pKey].filter(Boolean).join(' / ') || '';
    const mainClubMember = i.pKey ? (i.pCategory !== 'D' ? 'ja' : 'nein') : '';

    return [
      { attr: 'firstName',     person: i.firstName,   member: '',             regasoft: i.rFirstName,   mismatch: has('firstName') },
      { attr: 'lastName',      person: i.lastName,    member: '',             regasoft: i.rLastName,    mismatch: has('lastName') },
      { attr: 'key',           person: i.personKey,   member: memberKey,      regasoft: i.rid,          mismatch: false },
      { attr: 'srvId',         person: '',            member: i.memberId,     regasoft: i.rServiceId,   mismatch: has('memberId') },
      { attr: 'dateOfBirth',   person: i.dateOfBirth, member: '',             regasoft: i.rDateOfBirth, mismatch: has('dateOfBirth') },
      { attr: 'dateOfExit',    person: i.mDateOfExit, member: i.pDateOfExit,  regasoft: i.rDateOfExit,  mismatch: has('dateOfExit') },
      { attr: 'category',      person: i.mCategory,   member: i.pCategory,    regasoft: i.rCategory,    mismatch: has('pCategory') },
      { attr: 'email',         person: i.mEmail,      member: '',             regasoft: i.rEmail,       mismatch: has('email') },
      { attr: 'phone',         person: i.mPhone,      member: '',             regasoft: i.rPhone,       mismatch: has('phone') },
      { attr: 'street',        person: i.mStreet,     member: '',             regasoft: i.rStreet,      mismatch: has('street') },
      { attr: 'zipCode',       person: i.mZipCode,    member: '',             regasoft: i.rZipCode,     mismatch: has('zipCode') },
      { attr: 'city',          person: i.mCity,       member: '',             regasoft: i.rCity,        mismatch: has('city') },
      { attr: 'nation',        person: '',            member: '',             regasoft: i.nationIOC,    mismatch: false },
      { attr: 'hasNewsletter', person: '',            member: '',             regasoft: i.hasNewsletter ? 'ja' : 'nein', mismatch: false },
      { attr: 'mainClub',      person: '',            member: mainClubMember, regasoft: i.mainClub ? 'ja' : 'nein',     mismatch: false },
      { attr: 'licenseId',     person: '',            member: '',             regasoft: i.licenseId,    mismatch: false },
    ];
  });

  protected async close(): Promise<void> {
    await this.modalController.dismiss(null, 'cancel');
  }
}

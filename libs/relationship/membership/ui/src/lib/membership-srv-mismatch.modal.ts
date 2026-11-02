import { Component, computed, inject, input } from '@angular/core';
import { IonButton, IonButtons, IonCol, IonContent, IonGrid, IonHeader, IonRow, IonTitle, IonToolbar, ModalController } from '@ionic/angular';

import { SrvIndex, SrvMismatchKind } from '@okr/shared-models';
import { DateFormat, expectedSrvStatus, getMismatches, getTodayStr } from '@okr/shared-util-core';
import { I18nService } from '@okr/shared-i18n';
import { MEMBERSHIP_I18N_KEYS, MembershipI18n } from '@okr/relationship-membership-util';
import { dismissOverlay } from '@okr/shared-util-angular';

interface SrvDisplayRow {
  attr:      string;
  person:    string;
  member:    string;
  regasoft:  string;
  kind:      SrvMismatchKind | null;   // null = no difference
}

@Component({
  selector: 'okr-membership-srv-mismatch-modal',
  standalone: true,
  imports: [
    IonHeader, IonToolbar, IonTitle, IonButtons, IonButton,
    IonContent, IonGrid, IonRow, IonCol,
  ],
  styles: [`
    .mismatch { color: var(--ion-color-danger); font-weight: 500; }
    .mismatch-info { color: var(--ion-color-medium); }
    .kind-label { display: block; font-size: 0.8em; font-weight: 400; }
    ion-row { border-bottom: 1px solid var(--ion-color-light); }
  `],
  template: `
    <ion-header>
      <ion-toolbar color="warning">
        <ion-title>Vergleich: {{ item().firstName }} {{ item().lastName }}</ion-title>
        <ion-buttons slot="end">
          <ion-button (click)="close()">{{ i18n.close() }}</ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>
    <ion-content class="ion-padding">
      <ion-grid>
        <ion-row>
          <ion-col size="3"><strong>{{ i18n.srv_col_attribute() }}</strong></ion-col>
          <ion-col size="3"><strong>{{ i18n.srv_col_person() }}</strong></ion-col>
          <ion-col size="3"><strong>{{ i18n.srv_col_member() }}</strong></ion-col>
          <ion-col size="3"><strong>{{ i18n.srv_col_regasoft() }}</strong></ion-col>
        </ion-row>
        @for(row of rows(); track row.attr) {
          <ion-row [class.mismatch]="row.kind === 'fix' || row.kind === 'bk'" [class.mismatch-info]="row.kind === 'info'">
            <ion-col size="3">
              {{ row.attr }}
              @if (row.kind === 'info') { <span class="kind-label">{{ i18n.srv_mismatch_info() }}</span> }
              @if (row.kind === 'bk') { <span class="kind-label">{{ i18n.srv_mismatch_bk() }}</span> }
            </ion-col>
            <ion-col size="3">{{ row.person || '—' }}</ion-col>
            <ion-col size="3">{{ row.member || '—' }}</ion-col>
            <ion-col size="3">{{ row.regasoft || '—' }}</ion-col>
          </ion-row>
        }
      </ion-grid>
    </ion-content>
  `,
})
export class MembershipSrvMismatchModal {
  private readonly modalController = inject(ModalController);

  public item = input.required<SrvIndex>();

  // Direct inject (no store): MembershipSrvStore opens this modal, importing it back would be circular.
  protected readonly i18n = inject(I18nService).translateAll(MEMBERSHIP_I18N_KEYS) as MembershipI18n;

  protected rows = computed<SrvDisplayRow[]>(() => {
    const i = this.item();
    const today = getTodayStr(DateFormat.StoreDate);
    const kinds = new Map(getMismatches(i, today).map(m => [m.field, m.kind]));
    const kind = (field: string): SrvMismatchKind | null => kinds.get(field) ?? null;
    const expected = expectedSrvStatus({
      dateOfDeath: i.mDateOfDeath, dateOfExit: i.mDateOfExit, category: i.mCategory, passiveSince: i.mPassiveSince, today,
    });

    const memberKey = [i.mKey, i.pKey].filter(Boolean).join(' / ') || '';
    const mainClubMember = i.pKey ? (i.pCategory !== 'D' ? 'ja' : 'nein') : '';

    return [
      { attr: 'firstName',     person: i.firstName,   member: '',             regasoft: i.rFirstName,   kind: kind('firstName') },
      { attr: 'lastName',      person: i.lastName,    member: '',             regasoft: i.rLastName,    kind: kind('lastName') },
      { attr: 'gender',        person: i.gender,      member: '',             regasoft: i.rGender,      kind: kind('gender') },
      { attr: 'key',           person: i.personKey,   member: memberKey,      regasoft: i.rid,          kind: null },
      { attr: 'srvId',         person: '',            member: i.memberId,     regasoft: i.rServiceId,   kind: kind('memberId') },
      { attr: 'dateOfBirth',   person: i.dateOfBirth, member: '',             regasoft: i.rDateOfBirth, kind: kind('dateOfBirth') },
      { attr: 'dateOfExit',    person: i.mDateOfExit, member: i.pDateOfExit,  regasoft: i.rDateOfExit,  kind: kind('leavingDate') },
      { attr: 'dateOfDeath',   person: expected.dateOfDeath,   member: '',    regasoft: i.rDateOfDeath,  kind: kind('dateOfDeath') },
      { attr: 'inactiveDate',  person: expected.inactiveDate,  member: '',    regasoft: i.rInactiveDate, kind: kind('inactiveDate') },
      { attr: 'entryDate',     person: '',            member: '',             regasoft: i.rEntryDate,   kind: null },
      { attr: 'category',      person: i.mCategory,   member: i.pCategory,    regasoft: i.rCategory,    kind: kind('pCategory') },
      { attr: 'email',         person: i.mEmail,      member: '',             regasoft: i.rEmail,       kind: kind('email') },
      { attr: 'phone',         person: i.mPhone,      member: '',             regasoft: i.rMobile || i.rTelefon, kind: kind('phone') },
      { attr: 'street',        person: i.mStreet,     member: '',             regasoft: i.rStreet,      kind: kind('street') },
      { attr: 'zipCode',       person: i.mZipCode,    member: '',             regasoft: i.rZipCode,     kind: kind('zipCode') },
      { attr: 'city',          person: i.mCity,       member: '',             regasoft: i.rCity,        kind: kind('city') },
      { attr: 'country',       person: i.mCountryCode, member: '',            regasoft: i.rCountryId,   kind: kind('country') },
      { attr: 'nation',        person: '',            member: '',             regasoft: i.nationIOC,    kind: null },
      { attr: 'hasNewsletter', person: '',            member: '',             regasoft: i.hasNewsletter ? this.i18n.srv_mismatch_yes() : this.i18n.srv_mismatch_no(), kind: kind('hasNewsletter') },
      { attr: 'mainClub',      person: '',            member: mainClubMember, regasoft: i.mainClub ? this.i18n.srv_mismatch_yes() : this.i18n.srv_mismatch_no(),     kind: kind('mainClub') },
      { attr: 'licenseId',     person: '',            member: '',             regasoft: i.licenseId,    kind: null },
    ];
  });

  protected async close(): Promise<void> {
    await dismissOverlay(this.modalController, null, 'cancel');
  }
}

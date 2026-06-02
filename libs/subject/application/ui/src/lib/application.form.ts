import { DatePipe } from '@angular/common';
import { Component, computed, input, linkedSignal, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  IonCard, IonCardContent, IonCardHeader, IonCardTitle,
  IonInput, IonItem, IonLabel, IonRadio, IonRadioGroup, IonSelect, IonSelectOption
} from '@ionic/angular/standalone';
import { vestForms } from 'ngx-vest-forms';

import { ApplicationKind, ApplicationModel } from '@bk2/shared-models';
import { APPLICATION_KIND_VALUES } from '@bk2/shared-models';
import { coerceBoolean } from '@bk2/shared-util-core';
import { ApplicationI18n, needsSsn } from '@bk2/application-util';

@Component({
  selector: 'bk-application-form',
  standalone: true,
  imports: [
    DatePipe, FormsModule,
    vestForms,
    IonCard, IonCardContent, IonCardHeader, IonCardTitle,
    IonItem, IonLabel, IonInput,
    IonRadioGroup, IonRadio, IonSelect, IonSelectOption
  ],
  template: `
  <form #appForm="ngForm">
    @if(application().submittedAt) {
      <ion-item lines="none">
        <ion-label>{{ i18n().field_submitted_at() }}: {{ application().submittedAt | date:'dd.MM.yyyy HH:mm' }}</ion-label>
      </ion-item>
    }
    @if(application().reviewedAt) {
      <ion-item lines="none">
        <ion-label>{{ i18n().field_reviewed_at() }}: {{ application().reviewedAt | date:'dd.MM.yyyy HH:mm' }}</ion-label>
      </ion-item>
    }
    @if(application().reviewer) {
      <ion-item lines="none">
        <ion-label>{{ i18n().field_reviewer() }}: {{ application().reviewer!.name1 }} {{ application().reviewer!.name2 }}</ion-label>
      </ion-item>
    }
    @if(application().closeReason) {
      <ion-item lines="none">
        <ion-label>{{ i18n().field_close_reason() }}: {{ application().closeReason }}</ion-label>
      </ion-item>
    }

    <ion-card>
      <ion-card-header><ion-card-title>{{ i18n().section_person() }}</ion-card-title></ion-card-header>
      <ion-card-content>
        <ion-item>
          <ion-label position="stacked">{{ i18n().field_first_name() }}</ion-label>
          <ion-input name="firstName" [(ngModel)]="firstName" [disabled]="isReadOnly()" (ionChange)="emitChange()" />
        </ion-item>
        <ion-item>
          <ion-label position="stacked">{{ i18n().field_last_name() }}</ion-label>
          <ion-input name="lastName" [(ngModel)]="lastName" [disabled]="isReadOnly()" (ionChange)="emitChange()" />
        </ion-item>
        <ion-item>
          <ion-label>{{ i18n().field_gender() }}</ion-label>
          <ion-radio-group name="gender" [(ngModel)]="gender" [disabled]="isReadOnly()" (ionChange)="emitChange()">
            <ion-radio value="male">männlich</ion-radio>
            <ion-radio value="female">weiblich</ion-radio>
          </ion-radio-group>
        </ion-item>
        <ion-item>
          <ion-label position="stacked">{{ i18n().field_date_of_birth() }}</ion-label>
          <ion-input name="dateOfBirth" type="date" [(ngModel)]="dateOfBirthDisplay" [disabled]="isReadOnly()" (ionChange)="onDobChange($event)" />
        </ion-item>
        @if(showSsn()) {
          <ion-item>
            <ion-label position="stacked">{{ i18n().field_ssn() }}</ion-label>
            <ion-input name="ssnId" [(ngModel)]="ssnId" [disabled]="isReadOnly()" (ionChange)="emitChange()" />
          </ion-item>
        }
      </ion-card-content>
    </ion-card>

    <ion-card>
      <ion-card-header><ion-card-title>{{ i18n().section_contact() }}</ion-card-title></ion-card-header>
      <ion-card-content>
        <ion-item>
          <ion-label position="stacked">{{ i18n().field_email() }}</ion-label>
          <ion-input name="email" type="email" [(ngModel)]="email" [disabled]="isReadOnly()" (ionChange)="emitChange()" />
        </ion-item>
        <ion-item>
          <ion-label position="stacked">{{ i18n().field_phone() }}</ion-label>
          <ion-input name="phone" type="tel" [(ngModel)]="phone" [disabled]="isReadOnly()" (ionChange)="emitChange()" />
        </ion-item>
      </ion-card-content>
    </ion-card>

    <ion-card>
      <ion-card-header><ion-card-title>{{ i18n().section_address() }}</ion-card-title></ion-card-header>
      <ion-card-content>
        <ion-item>
          <ion-label position="stacked">{{ i18n().field_street_name() }}</ion-label>
          <ion-input name="streetName" [(ngModel)]="streetName" [disabled]="isReadOnly()" (ionChange)="emitChange()" />
        </ion-item>
        <ion-item>
          <ion-label position="stacked">{{ i18n().field_street_number() }}</ion-label>
          <ion-input name="streetNumber" [(ngModel)]="streetNumber" [disabled]="isReadOnly()" (ionChange)="emitChange()" />
        </ion-item>
        <ion-item>
          <ion-label position="stacked">{{ i18n().field_zip_code() }}</ion-label>
          <ion-input name="zipCode" [(ngModel)]="zipCode" [disabled]="isReadOnly()" (ionChange)="emitChange()" />
        </ion-item>
        <ion-item>
          <ion-label position="stacked">{{ i18n().field_city() }}</ion-label>
          <ion-input name="city" [(ngModel)]="city" [disabled]="isReadOnly()" (ionChange)="emitChange()" />
        </ion-item>
        <ion-item>
          <ion-label position="stacked">{{ i18n().field_country_code() }}</ion-label>
          <ion-input name="countryCode" [(ngModel)]="countryCode" [disabled]="isReadOnly()" (ionChange)="emitChange()" />
        </ion-item>
      </ion-card-content>
    </ion-card>

    @if(isYouth()) {
      <ion-card>
        <ion-card-header><ion-card-title>{{ i18n().section_parent() }}</ion-card-title></ion-card-header>
        <ion-card-content>
          <ion-item>
            <ion-label position="stacked">{{ i18n().field_parent_first_name() }}</ion-label>
            <ion-input name="parentFirstName" [(ngModel)]="parentFirstName" [disabled]="isReadOnly()" (ionChange)="emitChange()" />
          </ion-item>
          <ion-item>
            <ion-label position="stacked">{{ i18n().field_parent_last_name() }}</ion-label>
            <ion-input name="parentLastName" [(ngModel)]="parentLastName" [disabled]="isReadOnly()" (ionChange)="emitChange()" />
          </ion-item>
          <ion-item>
            <ion-label position="stacked">{{ i18n().field_parent_email() }}</ion-label>
            <ion-input name="parentEmail" type="email" [(ngModel)]="parentEmail" [disabled]="isReadOnly()" (ionChange)="emitChange()" />
          </ion-item>
          <ion-item>
            <ion-label position="stacked">{{ i18n().field_parent_phone() }}</ion-label>
            <ion-input name="parentPhone" type="tel" [(ngModel)]="parentPhone" [disabled]="isReadOnly()" (ionChange)="emitChange()" />
          </ion-item>
        </ion-card-content>
      </ion-card>
    }

    <ion-card>
      <ion-card-header><ion-card-title>{{ i18n().section_application() }}</ion-card-title></ion-card-header>
      <ion-card-content>
        <ion-item>
          <ion-label>{{ i18n().field_application_as() }}</ion-label>
          <ion-select name="applicationAs" [(ngModel)]="applicationAs" [disabled]="isReadOnly()" (ionChange)="emitChange()">
            @for(k of kindValues; track k) {
              <ion-select-option [value]="k">{{ k }}</ion-select-option>
            }
          </ion-select>
        </ion-item>
      </ion-card-content>
    </ion-card>
  </form>
  `
})
export class ApplicationForm {
  public readonly application = input.required<ApplicationModel>();
  public readonly readonly    = input<boolean>(false);
  public readonly i18n        = input.required<ApplicationI18n>();

  public readonly applicationChange = output<ApplicationModel>();

  protected isReadOnly = computed(() => coerceBoolean(this.readonly()));
  protected isYouth    = computed(() => this.application().applicationAs === 'youth');
  protected showSsn    = computed(() => needsSsn(this.application()));
  protected kindValues: ApplicationKind[] = APPLICATION_KIND_VALUES;

  protected firstName     = linkedSignal(() => this.application().firstName);
  protected lastName      = linkedSignal(() => this.application().lastName);
  protected gender        = linkedSignal(() => this.application().gender);
  protected dateOfBirthDisplay = linkedSignal(() => this.application().dateOfBirth);
  protected ssnId         = linkedSignal(() => this.application().ssnId);
  protected email         = linkedSignal(() => this.application().email);
  protected phone         = linkedSignal(() => this.application().phone);
  protected streetName    = linkedSignal(() => this.application().streetName);
  protected streetNumber  = linkedSignal(() => this.application().streetNumber);
  protected zipCode       = linkedSignal(() => this.application().zipCode);
  protected city          = linkedSignal(() => this.application().city);
  protected countryCode   = linkedSignal(() => this.application().countryCode);
  protected parentFirstName = linkedSignal(() => this.application().parentFirstName);
  protected parentLastName  = linkedSignal(() => this.application().parentLastName);
  protected parentEmail     = linkedSignal(() => this.application().parentEmail);
  protected parentPhone     = linkedSignal(() => this.application().parentPhone);
  protected applicationAs   = linkedSignal(() => this.application().applicationAs);

  protected onDobChange(event: Event): void {
    const raw = (event as CustomEvent).detail?.value ?? '';
    this.dateOfBirthDisplay.set(raw.replace(/-/g, ''));
    this.emitChange();
  }

  protected emitChange(): void {
    const updated: ApplicationModel = {
      ...this.application(),
      firstName:       this.firstName(),
      lastName:        this.lastName(),
      gender:          this.gender(),
      dateOfBirth:     this.dateOfBirthDisplay(),
      ssnId:           this.ssnId(),
      email:           this.email(),
      phone:           this.phone(),
      streetName:      this.streetName(),
      streetNumber:    this.streetNumber(),
      zipCode:         this.zipCode(),
      city:            this.city(),
      countryCode:     this.countryCode(),
      parentFirstName: this.parentFirstName(),
      parentLastName:  this.parentLastName(),
      parentEmail:     this.parentEmail(),
      parentPhone:     this.parentPhone(),
      applicationAs:   this.applicationAs(),
    };
    this.applicationChange.emit(updated);
  }
}

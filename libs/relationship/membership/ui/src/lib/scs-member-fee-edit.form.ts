import { FormsModule } from '@angular/forms';
import { ChangeDetectionStrategy, Component, computed, input, output, Signal } from '@angular/core';
import { IonCard, IonCardContent, IonCol, IonGrid, IonItem, IonLabel, IonRow } from '@ionic/angular/standalone';
import { vestForms } from 'ngx-vest-forms';

import { CategoryListModel, INVOICE_STATE_VALUES, REBATE_REASON_VALUES, ScsMemberFeesModel, UserModel } from '@bk2/shared-models';
import { NotesInput, NotesInputI18n, NumberInput, NumberInputI18n, StringSelect, StringSelectI18n } from '@bk2/shared-ui';
import { getAge } from '@bk2/shared-util-core';

import { scsMemberFeeValidations } from '@bk2/relationship-membership-util';

export interface ScsMemberFeeEditFormI18n {
  jb_label: Signal<string>;
  jb_placeholder: Signal<string>;
  jb_helper: Signal<string>;
  srv_label: Signal<string>;
  srv_placeholder: Signal<string>;
  srv_helper: Signal<string>;
  bev_label: Signal<string>;
  bev_placeholder: Signal<string>;
  bev_helper: Signal<string>;
  entryFee_label: Signal<string>;
  entryFee_placeholder: Signal<string>;
  entryFee_helper: Signal<string>;
  locker_label: Signal<string>;
  locker_placeholder: Signal<string>;
  locker_helper: Signal<string>;
  skiff_label: Signal<string>;
  skiff_placeholder: Signal<string>;
  skiff_helper: Signal<string>;
  skiffInsurance_label: Signal<string>;
  skiffInsurance_placeholder: Signal<string>;
  skiffInsurance_helper: Signal<string>;
  rebate_label: Signal<string>;
  rebate_placeholder: Signal<string>;
  rebate_helper: Signal<string>;
  notes_label: Signal<string>;
  notes_placeholder: Signal<string>;
  rebateReason_label: Signal<string>;
  invoiceState_label: Signal<string>;
}

@Component({
  selector: 'bk-scs-member-fee-edit-form',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    vestForms, FormsModule,
    NumberInput, StringSelect, NotesInput,
    IonGrid, IonRow, IonCol, IonCard, IonCardContent, IonItem, IonLabel,
  ],
  styles: [`@media (width <= 600px) { ion-card { margin: 5px; } }`],
  template: `
    @if (showForm() && formData(); as fd) {
      <form scVestForm
        [formValue]="fd"
        [suite]="suite"
        (dirtyChange)="dirty.emit($event)"
        (validChange)="valid.emit($event)">

        <ion-card>
          <ion-card-content class="ion-no-padding">
            <!-- read-only member info -->
            <ion-grid>
              <ion-row>
                <ion-col size="12">
                  <ion-item lines="none">
                    <ion-label>Alter: {{ age() }}</ion-label>
                    <ion-label>MKat: {{ category() }}</ion-label>
                    <ion-label>Bexio ID: {{ bexioId() }}</ion-label>
                  </ion-item>
                </ion-col>
              </ion-row>

              <!-- fee amounts — name maps to @input.{name}.label i18n key -->
              <ion-row>
                <ion-col size="6" size-md="4">
                  <bk-number-input [i18n]="jbI18n()" [value]="fd.jb" (valueChange)="onFieldChange('jb', $event, fd)" [readOnly]="readOnly()" />
                </ion-col>
                <ion-col size="6" size-md="4">
                  <bk-number-input [i18n]="srvI18n()" [value]="fd.srv" (valueChange)="onFieldChange('srv', $event, fd)" [readOnly]="readOnly()" />
                </ion-col>
              </ion-row>
              <ion-row>
                <ion-col size="6" size-md="4">
                  <bk-number-input [i18n]="bevI18n()" [value]="fd.bev" (valueChange)="onFieldChange('bev', $event, fd)" [readOnly]="readOnly()" />
                </ion-col>
                <ion-col size="6" size-md="4">
                  <bk-number-input [i18n]="entryFeeI18n()" [value]="fd.entryFee" (valueChange)="onFieldChange('entryFee', $event, fd)" [readOnly]="readOnly()" />
                </ion-col>
                <ion-col size="6" size-md="4">
                  <bk-number-input [i18n]="lockerI18n()" [value]="fd.locker" (valueChange)="onFieldChange('locker', $event, fd)" [readOnly]="readOnly()" />
                </ion-col>
              </ion-row>
              <ion-row>
                <ion-col size="6" size-md="4">
                  <bk-number-input [i18n]="skiffI18n()" [value]="fd.skiff" (valueChange)="onFieldChange('skiff', $event, fd)" [readOnly]="readOnly()" />
                </ion-col>
                <ion-col size="6" size-md="4">
                  <bk-number-input [i18n]="skiffInsuranceI18n()" [value]="fd.skiffInsurance" (valueChange)="onFieldChange('skiffInsurance', $event, fd)" [readOnly]="readOnly()" />
                </ion-col>
              </ion-row>

              <!-- rebate -->
              <ion-row>
                <ion-col size="6" size-md="4">
                  <bk-number-input [i18n]="rebateI18n()" [value]="fd.rebate" (valueChange)="onFieldChange('rebate', $event, fd)" [readOnly]="readOnly()" />
                </ion-col>
                <ion-col size="6" size-md="4">
                  <bk-string-select [i18n]="rebateReasonI18n()"
                    [selectedString]="fd.rebateReason"
                    (selectedStringChange)="onFieldChange('rebateReason', $event, fd)"
                    [readOnly]="readOnly()"
                    [stringList]="rebateReasonList" />
                </ion-col>
              </ion-row>

              <!-- invoice state -->
              <ion-row>
                <ion-col size="6" size-md="4">
                  <bk-string-select [i18n]="invoiceStateI18n()"
                    [selectedString]="fd.state"
                    (selectedStringChange)="onFieldChange('state', $event, fd)"
                    [readOnly]="readOnly()"
                    [stringList]="invoiceStateList" />
                </ion-col>
              </ion-row>
            </ion-grid>
          </ion-card-content>
        </ion-card>
        <bk-notes-input [i18n]="notesI18n()" [value]="notes()" (valueChange)="onFieldChange('notes', $event, fd)" [readOnly]="false" />
      </form>
    }
  `
})
export class ScsMemberFeeEditForm {
  // i18n — all translations come from the i18n input
  protected jbI18n             = computed(() => ({ name: 'jb',             label: this.i18n().jb_label(),             placeholder: this.i18n().jb_placeholder(),             helper: this.i18n().jb_helper()             } as NumberInputI18n));
  protected srvI18n            = computed(() => ({ name: 'srv',            label: this.i18n().srv_label(),            placeholder: this.i18n().srv_placeholder(),            helper: this.i18n().srv_helper()            } as NumberInputI18n));
  protected bevI18n            = computed(() => ({ name: 'bev',            label: this.i18n().bev_label(),            placeholder: this.i18n().bev_placeholder(),            helper: this.i18n().bev_helper()            } as NumberInputI18n));
  protected entryFeeI18n       = computed(() => ({ name: 'entryFee',       label: this.i18n().entryFee_label(),       placeholder: this.i18n().entryFee_placeholder(),       helper: this.i18n().entryFee_helper()       } as NumberInputI18n));
  protected lockerI18n         = computed(() => ({ name: 'locker',         label: this.i18n().locker_label(),         placeholder: this.i18n().locker_placeholder(),         helper: this.i18n().locker_helper()         } as NumberInputI18n));
  protected skiffI18n          = computed(() => ({ name: 'skiff',          label: this.i18n().skiff_label(),          placeholder: this.i18n().skiff_placeholder(),          helper: this.i18n().skiff_helper()          } as NumberInputI18n));
  protected skiffInsuranceI18n = computed(() => ({ name: 'skiffInsurance', label: this.i18n().skiffInsurance_label(), placeholder: this.i18n().skiffInsurance_placeholder(), helper: this.i18n().skiffInsurance_helper() } as NumberInputI18n));
  protected rebateI18n         = computed(() => ({ name: 'rebate',         label: this.i18n().rebate_label(),         placeholder: this.i18n().rebate_placeholder(),         helper: this.i18n().rebate_helper()         } as NumberInputI18n));
  protected notesI18n          = computed(() => ({ name: 'notes',          label: this.i18n().notes_label(),          placeholder: this.i18n().notes_placeholder()                                                        } as NotesInputI18n));
  protected rebateReasonI18n   = computed(() => ({ name: 'rebateReason',   label: this.i18n().rebateReason_label()                                                                                                        } as StringSelectI18n));
  protected invoiceStateI18n   = computed(() => ({ name: 'invoiceState',   label: this.i18n().invoiceState_label()                                                                                                        } as StringSelectI18n));

  // inputs
  public readonly i18n = input.required<ScsMemberFeeEditFormI18n>();
  public formData = input<ScsMemberFeesModel | undefined>(undefined);
  public currentUser = input<UserModel | undefined>(undefined);
  public showForm = input(true);
  public readOnly = input(false);
  public membershipCategories = input<CategoryListModel | undefined>(undefined);

  // signals
  public dirty = output<boolean>();
  public valid = output<boolean>();
  public formDataChange = output<ScsMemberFeesModel>();

  // computed
  protected age = computed(() => {
    const dob = this.formData()?.memberDateOfBirth;
    return dob ? getAge(dob) : '';
  });
  protected category = computed(() => this.formData()?.category ?? '');
  protected bexioId = computed(() => this.formData()?.memberBexioId ?? '');
  protected notes = computed(() => this.formData()?.notes ?? '');

  protected readonly suite = scsMemberFeeValidations;
  protected readonly rebateReasonList = [...REBATE_REASON_VALUES];
  protected readonly invoiceStateList = [...INVOICE_STATE_VALUES];

  protected onFieldChange(field: keyof ScsMemberFeesModel, value: unknown, fd: ScsMemberFeesModel): void {
    this.dirty.emit(true);
    this.formDataChange.emit({ ...fd, [field]: value });
  }
}

import { FormsModule } from '@angular/forms';
import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { IonCard, IonCardContent, IonCol, IonGrid, IonItem, IonLabel, IonRow } from '@ionic/angular/standalone';
import { vestForms } from 'ngx-vest-forms';

import { CategoryListModel, INVOICE_STATE_VALUES, REBATE_REASON_VALUES, ScsMemberFeesModel, UserModel } from '@bk2/shared-models';
import { NotesInput, NotesInputI18n, NumberInput, NumberInputI18n, StringSelect, StringSelectI18n } from '@bk2/shared-ui';
import { getAge } from '@bk2/shared-util-core';
import { I18nService } from '@bk2/shared-i18n';
import { PFX } from './scope';

import { scsMemberFeeValidations } from '@bk2/relationship-membership-util';

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
  // i18n
  private readonly i18nService = inject(I18nService);
  protected readonly fieldI18n = this.i18nService.translateAll({
    jb_label:             PFX + 'jb.label',             jb_placeholder:             PFX + 'jb.placeholder',             jb_helper:             PFX + 'jb.helper',
    srv_label:            PFX + 'srv.label',            srv_placeholder:            PFX + 'srv.placeholder',            srv_helper:            PFX + 'srv.helper',
    bev_label:            PFX + 'bev.label',            bev_placeholder:            PFX + 'bev.placeholder',            bev_helper:            PFX + 'bev.helper',
    entryFee_label:       PFX + 'entryFee.label',       entryFee_placeholder:       PFX + 'entryFee.placeholder',       entryFee_helper:       PFX + 'entryFee.helper',
    locker_label:         PFX + 'locker.label',         locker_placeholder:         PFX + 'locker.placeholder',         locker_helper:         PFX + 'locker.helper',
    skiff_label:          PFX + 'skiff.label',          skiff_placeholder:          PFX + 'skiff.placeholder',          skiff_helper:          PFX + 'skiff.helper',
    skiffInsurance_label: PFX + 'skiffInsurance.label', skiffInsurance_placeholder: PFX + 'skiffInsurance.placeholder', skiffInsurance_helper: PFX + 'skiffInsurance.helper',
    rebate_label:         PFX + 'rebate.label',         rebate_placeholder:         PFX + 'rebate.placeholder',         rebate_helper:         PFX + 'rebate.helper',
    notes_label:          PFX + 'notes.label',          notes_placeholder:          PFX + 'notes.placeholder',
    rebateReason_label:   PFX + 'rebateReason.label',
    invoiceState_label:   PFX + 'invoiceState.label',
  });
  protected jbI18n             = computed(() => ({ name: 'jb',             label: this.fieldI18n.jb_label(),             placeholder: this.fieldI18n.jb_placeholder(),             helper: this.fieldI18n.jb_helper()             } as NumberInputI18n));
  protected srvI18n            = computed(() => ({ name: 'srv',            label: this.fieldI18n.srv_label(),            placeholder: this.fieldI18n.srv_placeholder(),            helper: this.fieldI18n.srv_helper()            } as NumberInputI18n));
  protected bevI18n            = computed(() => ({ name: 'bev',            label: this.fieldI18n.bev_label(),            placeholder: this.fieldI18n.bev_placeholder(),            helper: this.fieldI18n.bev_helper()            } as NumberInputI18n));
  protected entryFeeI18n       = computed(() => ({ name: 'entryFee',       label: this.fieldI18n.entryFee_label(),       placeholder: this.fieldI18n.entryFee_placeholder(),       helper: this.fieldI18n.entryFee_helper()       } as NumberInputI18n));
  protected lockerI18n         = computed(() => ({ name: 'locker',         label: this.fieldI18n.locker_label(),         placeholder: this.fieldI18n.locker_placeholder(),         helper: this.fieldI18n.locker_helper()         } as NumberInputI18n));
  protected skiffI18n          = computed(() => ({ name: 'skiff',          label: this.fieldI18n.skiff_label(),          placeholder: this.fieldI18n.skiff_placeholder(),          helper: this.fieldI18n.skiff_helper()          } as NumberInputI18n));
  protected skiffInsuranceI18n = computed(() => ({ name: 'skiffInsurance', label: this.fieldI18n.skiffInsurance_label(), placeholder: this.fieldI18n.skiffInsurance_placeholder(), helper: this.fieldI18n.skiffInsurance_helper() } as NumberInputI18n));
  protected rebateI18n         = computed(() => ({ name: 'rebate',         label: this.fieldI18n.rebate_label(),         placeholder: this.fieldI18n.rebate_placeholder(),         helper: this.fieldI18n.rebate_helper()         } as NumberInputI18n));
  protected notesI18n          = computed(() => ({ name: 'notes',         label: this.fieldI18n.notes_label(),         placeholder: this.fieldI18n.notes_placeholder() } as NotesInputI18n));
  protected rebateReasonI18n   = computed(() => ({ name: 'rebateReason',  label: this.fieldI18n.rebateReason_label()  } as StringSelectI18n));
  protected invoiceStateI18n   = computed(() => ({ name: 'invoiceState',  label: this.fieldI18n.invoiceState_label()  } as StringSelectI18n));

  // inputs
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

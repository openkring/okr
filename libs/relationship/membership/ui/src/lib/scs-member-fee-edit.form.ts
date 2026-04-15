import { FormsModule } from '@angular/forms';
import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { IonCard, IonCardContent, IonCol, IonGrid, IonItem, IonLabel, IonRow } from '@ionic/angular/standalone';
import { vestForms } from 'ngx-vest-forms';

import { CategoryListModel, INVOICE_STATE_VALUES, REBATE_REASON_VALUES, ScsMemberFeesModel, UserModel } from '@bk2/shared-models';
import { NotesInputComponent, NumberInputComponent, StringSelectComponent } from '@bk2/shared-ui';
import { getAge } from '@bk2/shared-util-core';

import { scsMemberFeeValidations } from '@bk2/relationship-membership-util';

@Component({
  selector: 'bk-scs-member-fee-edit-form',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    vestForms, FormsModule,
    NumberInputComponent, StringSelectComponent, NotesInputComponent,
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
                  <bk-number-input name="jb" [value]="fd.jb" (valueChange)="onFieldChange('jb', $event, fd)" [readOnly]="readOnly()" />
                </ion-col>
                <ion-col size="6" size-md="4">
                  <bk-number-input name="srv" [value]="fd.srv" (valueChange)="onFieldChange('srv', $event, fd)" [readOnly]="readOnly()" />
                </ion-col>
              </ion-row>
              <ion-row>
                <ion-col size="6" size-md="4">
                  <bk-number-input name="bev" [value]="fd.bev" (valueChange)="onFieldChange('bev', $event, fd)" [readOnly]="readOnly()" />
                </ion-col>
                <ion-col size="6" size-md="4">
                  <bk-number-input name="entryFee" [value]="fd.entryFee" (valueChange)="onFieldChange('entryFee', $event, fd)" [readOnly]="readOnly()" />
                </ion-col>
                <ion-col size="6" size-md="4">
                  <bk-number-input name="locker" [value]="fd.locker" (valueChange)="onFieldChange('locker', $event, fd)" [readOnly]="readOnly()" />
                </ion-col>
              </ion-row>
              <ion-row>
                <ion-col size="6" size-md="4">
                  <bk-number-input name="skiff" [value]="fd.skiff" (valueChange)="onFieldChange('skiff', $event, fd)" [readOnly]="readOnly()" />
                </ion-col>
                <ion-col size="6" size-md="4">
                  <bk-number-input name="skiffInsurance" [value]="fd.skiffInsurance" (valueChange)="onFieldChange('skiffInsurance', $event, fd)" [readOnly]="readOnly()" />
                </ion-col>
              </ion-row>

              <!-- rebate -->
              <ion-row>
                <ion-col size="6" size-md="4">
                  <bk-number-input name="rebate" [value]="fd.rebate" (valueChange)="onFieldChange('rebate', $event, fd)" [readOnly]="readOnly()" />
                </ion-col>
                <ion-col size="6" size-md="4">
                  <bk-string-select name="rebateReason"
                    [selectedString]="fd.rebateReason"
                    (selectedStringChange)="onFieldChange('rebateReason', $event, fd)"
                    [readOnly]="readOnly()"
                    [stringList]="rebateReasonList" />
                </ion-col>
              </ion-row>

              <!-- invoice state -->
              <ion-row>
                <ion-col size="6" size-md="4">
                  <bk-string-select name="invoiceState"
                    [selectedString]="fd.state"
                    (selectedStringChange)="onFieldChange('state', $event, fd)"
                    [readOnly]="readOnly()"
                    [stringList]="invoiceStateList" />
                </ion-col>
              </ion-row>
            </ion-grid>
          </ion-card-content>
        </ion-card>
        <bk-notes [value]="notes()" (valueChange)="onFieldChange('notes', $event, fd)" [readOnly]="false" />
      </form>
    }
  `
})
export class ScsMemberFeeEditForm {
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

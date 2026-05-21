import { Component, computed, inject, input, linkedSignal, model, output } from '@angular/core';
import { IonCard, IonCardContent, IonCol, IonGrid, IonRow } from '@ionic/angular/standalone';
import { vestForms } from 'ngx-vest-forms';

import { BexioIdMask, ChVatMask } from '@bk2/shared-config';
import { CategoryListModel, OrgModel, RoleName, UserModel } from '@bk2/shared-models';
import { CategorySelect, Chips, DateInput, DateInputI18n, NotesInput, NotesInputI18n, TextInput, TextInputI18n } from '@bk2/shared-ui';
import { coerceBoolean, debugFormErrors, debugFormModel, hasRole } from '@bk2/shared-util-core';
import { I18nService } from '@bk2/shared-i18n';

import { orgValidations } from '@bk2/subject-org-util';
import { PFX } from './scope';

@Component({
  selector: 'bk-org-form',
  standalone: true,
  imports: [
    vestForms,
    CategorySelect, DateInput, TextInput, Chips, NotesInput,
    IonGrid, IonRow, IonCol, IonCard, IonCardContent
  ],
   styles: [`@media (width <= 600px) { ion-card { margin: 5px;} }`],
  template: `
  @if (showForm()) {
    <form scVestForm
      [formValue]="formData()"
      [suite]="suite" 
      (dirtyChange)="dirty.emit($event)"
      (validChange)="valid.emit($event)"
      (formValueChange)="onFormChange($event)">

      <ion-card>
        <ion-card-content class="ion-no-padding">
          <ion-grid>
            @if(hasRole('admin')) {
              <ion-row>
                <ion-col size="12" size-md="6">
                  <bk-text-input [i18n]="bkeyI18n()" [value]="bkey()" [readOnly]="true" [copyable]="true" />
                </ion-col>
              </ion-row>
            }
            @if(isOrgTypeVisible()) {
              <ion-row>
                <ion-col size="12" size-md="6">
                  <bk-cat-select [category]="types()!" [selectedItemName]="type()" (selectedItemNameChange)="onFieldChange('type', $event)" [readOnly]="isOrgTypeReadOnly()" />
                </ion-col>
              </ion-row>
            }
            <ion-row> 
              <ion-col size="12">
                <bk-text-input [i18n]="nameI18n()" [value]="name()" (valueChange)="onFieldChange('name', $event)" autocomplete="organization" [maxLength]=50 [readOnly]="isReadOnly()" />
              </ion-col>
            </ion-row>
            <ion-row>
              <ion-col size="12" size-md="6">
                <bk-date-input [i18n]="dateOfFoundationI18n()" [storeDate]="dateOfFoundation()" (storeDateChange)="onFieldChange('dateOfFoundation', $event)" [readOnly]="isReadOnly()" />
              </ion-col>

              <ion-col size="12" size-md="6">
                <bk-date-input [i18n]="dateOfLiquidationI18n()" [storeDate]="dateOfLiquidation()" (storeDateChange)="onFieldChange('dateOfLiquidation', $event)" [readOnly]="isReadOnly()" />
              </ion-col>
            </ion-row>
            <ion-row>
              <ion-col size="12" size-md="6">
                <bk-text-input [i18n]="taxIdI18n()" [value]="taxId()" (valueChange)="onFieldChange('taxId', $event)" [mask]="vatMask" [showHelper]=true [readOnly]="isReadOnly()" />
              </ion-col>
              @if(hasRole('admin')) { 
                <ion-col size="12" size-md="6">
                  <bk-text-input [i18n]="bexioIdI18n()" [value]="bexioId()" (valueChange)="onFieldChange('bexioId', $event)" [maxLength]=6 [mask]="bexioMask" [showHelper]=true [readOnly]="isReadOnly()" />
                </ion-col>
              }
            </ion-row>
          </ion-grid>
        </ion-card-content>
      </ion-card>

      @if(hasRole('privileged') || hasRole('memberAdmin')) {
        <bk-chips chipName="tag" [storedChips]="tags()" (storedChipsChange)="onFieldChange('tags', $event)" [allChips]="allTags()" [readOnly]="isReadOnly()" />
      }

      @if(hasRole('admin')) { 
        <bk-notes-input [i18n]="notesI18n()" [readOnly]="isReadOnly()" [value]="notes()" (valueChange)="onFieldChange('notes', $event)" />
      }
    </form>
  }
  `
})
export class OrgForm {
  private readonly i18nService = inject(I18nService);
  protected readonly fieldI18n = this.i18nService.translateAll({
    bkey_label:        PFX + 'bkey.label',
    bkey_placeholder:  PFX + 'bkey.placeholder',
    bkey_helper:       PFX + 'bkey.helper',
    name_label:        PFX + 'name.label',
    name_placeholder:  PFX + 'name.placeholder',
    name_helper:       PFX + 'name.helper',
    taxId_label:       PFX + 'taxId.label',
    taxId_placeholder: PFX + 'taxId.placeholder',
    taxId_helper:      PFX + 'taxId.helper',
    bexioId_label:     PFX + 'bexioId.label',
    bexioId_placeholder: PFX + 'bexioId.placeholder',
    bexioId_helper:    PFX + 'bexioId.helper',
    notes_label:       PFX + 'notes.label',
    notes_placeholder: PFX + 'notes.placeholder',
    dateOfFoundation_label:        PFX + 'dateOfFoundation.label',
    dateOfFoundation_placeholder:  PFX + 'dateOfFoundation.placeholder',
    dateOfFoundation_helper:       PFX + 'dateOfFoundation.helper',
    dateOfLiquidation_label:       PFX + 'dateOfLiquidation.label',
    dateOfLiquidation_placeholder: PFX + 'dateOfLiquidation.placeholder',
    dateOfLiquidation_helper:      PFX + 'dateOfLiquidation.helper',
  });
  protected bkeyI18n   = computed(() => ({ name: 'bkey',   label: this.fieldI18n.bkey_label(),   placeholder: this.fieldI18n.bkey_placeholder(),   helper: this.fieldI18n.bkey_helper()   } as TextInputI18n));
  protected nameI18n   = computed(() => ({ name: 'name',   label: this.fieldI18n.name_label(),   placeholder: this.fieldI18n.name_placeholder(),   helper: this.fieldI18n.name_helper()   } as TextInputI18n));
  protected taxIdI18n  = computed(() => ({ name: 'taxId',  label: this.fieldI18n.taxId_label(),  placeholder: this.fieldI18n.taxId_placeholder(),  helper: this.fieldI18n.taxId_helper()  } as TextInputI18n));
  protected bexioIdI18n = computed(() => ({ name: 'bexioId', label: this.fieldI18n.bexioId_label(), placeholder: this.fieldI18n.bexioId_placeholder(), helper: this.fieldI18n.bexioId_helper() } as TextInputI18n));
  protected notesI18n   = computed(() => ({ name: 'notes', label: this.fieldI18n.notes_label(), placeholder: this.fieldI18n.notes_placeholder() } as NotesInputI18n));
  protected dateOfFoundationI18n  = computed(() => ({ name: 'dateOfFoundation',  label: this.fieldI18n.dateOfFoundation_label(),  placeholder: this.fieldI18n.dateOfFoundation_placeholder(),  helper: this.fieldI18n.dateOfFoundation_helper()  } as DateInputI18n));
  protected dateOfLiquidationI18n = computed(() => ({ name: 'dateOfLiquidation', label: this.fieldI18n.dateOfLiquidation_label(), placeholder: this.fieldI18n.dateOfLiquidation_placeholder(), helper: this.fieldI18n.dateOfLiquidation_helper() } as DateInputI18n));

  // inputs
  public readonly formData = model.required<OrgModel>();
  public readonly currentUser = input<UserModel | undefined>();
  public showForm = input(true);   // used for initializing the form and resetting vest validations
  public readonly allTags = input.required<string>();
  public readonly tenantId = input.required<string>();
  public readonly types = input.required<CategoryListModel>();
  public isOrgTypeReadOnly = input(false);
  public isOrgTypeVisible = input(true);
  public readOnly = input<boolean>(true);
  protected isReadOnly = computed(() => coerceBoolean(this.readOnly()));

  // signals
  public dirty = output<boolean>();
  public valid = output<boolean>();

  // validation and errors
  protected readonly suite = orgValidations;
  private readonly validationResult = computed(() => orgValidations(this.formData(), this.tenantId(), this.allTags()));
  protected nameErrors = computed(() => this.validationResult().getErrors('name'));

  // fields
  protected type = linkedSignal(() => this.formData().type ?? 'association');
  protected name = linkedSignal(() => this.formData().name ?? '');
  protected dateOfFoundation = linkedSignal(() => this.formData().dateOfFoundation ?? '');
  protected dateOfLiquidation = linkedSignal(() => this.formData().dateOfLiquidation ?? '');
  protected taxId = linkedSignal(() => this.formData().taxId ?? '');
  protected bexioId = linkedSignal(() => this.formData().bexioId ?? '');
  protected tags = linkedSignal(() => this.formData().tags ?? '');
  protected notes = linkedSignal(() => this.formData().notes ?? '');
  protected bkey = computed(() => this.formData().bkey ?? '');

  // passing constants to template
  protected bexioMask = BexioIdMask;
  protected vatMask = ChVatMask;

  /******************************* actions *************************************** */
  protected onFieldChange(fieldName: string, fieldValue: string | number | boolean): void {
    this.dirty.emit(true);
    this.formData.update((vm) => ({ ...vm, [fieldName]: fieldValue }));
  }

  protected onFormChange(value: OrgModel): void {
    this.formData.update((vm) => ({...vm, ...value}));
    debugFormModel('OrgForm.onFormChange', this.formData(), this.currentUser());
    debugFormErrors('OrgForm.onFormChange', this.validationResult().errors, this.currentUser());
  }

  protected hasRole(role: RoleName): boolean {
    return hasRole(role, this.currentUser());
  }
}

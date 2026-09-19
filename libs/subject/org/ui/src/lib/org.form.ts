import { Component, computed, effect, input, linkedSignal, model, output } from '@angular/core';
import { IonCard, IonCardContent, IonCol, IonGrid, IonRow } from '@ionic/angular/standalone';

import { BexioIdMask, ChVatMask } from '@okr/shared-config';
import { CategoryListModel, OrgModel, RoleName, UserModel } from '@okr/shared-models';
import { CategorySelect, Chips, DateInput, DateInputI18n, NotesInput, NotesInputI18n, TextInput, TextInputI18n , ErrorNote} from '@okr/shared-ui';
import { coerceBoolean, hasRole } from '@okr/shared-util-core';

import { OrgI18n, orgValidations } from '@okr/subject-org-util';
import { ZefixCompanyDetails } from '@okr/subject-org-data-access';
import { BEXIO_ID_LENGTH, DESCRIPTION_LENGTH, SHORT_NAME_LENGTH } from '@okr/shared-constants';

import { ZefixLookup } from './zefix-lookup';

@Component({
  selector: 'okr-org-form',
  standalone: true,
  imports: [
    ErrorNote,
    CategorySelect, DateInput, TextInput, Chips, NotesInput, ZefixLookup,
    IonGrid, IonRow, IonCol, IonCard, IonCardContent
  ],
   styles: [`@media (width <= 600px) { ion-card { margin: 5px;} }`],
  template: `
  @if (showForm()) {
    <form novalidate>

      <ion-card>
        <ion-card-content class="ion-no-padding">
          <ion-grid>
            @if(hasRole('admin')) {
              <ion-row>
                <ion-col size="12" size-md="6">
                  <okr-text-input [i18n]="okeyI18n()" [value]="okey()" [readOnly]="true" [copyable]="true" />
                </ion-col>
              </ion-row>
            }
            @if(isOrgTypeVisible()) {
              <ion-row>
                <ion-col size="12" size-md="6">
                  <okr-cat-select [category]="types()!" [selectedItemName]="type()" (selectedItemNameChange)="onFieldChange('type', $event)" [readOnly]="isOrgTypeReadOnly()" />
                  <okr-error-note [errors]="typeErrors()" />
                </ion-col>
              </ion-row>
            }
            <ion-row class="ion-align-items-center">
              <ion-col [size]="isZefixLookupVisible() ? 10 : 12">
                <okr-text-input [i18n]="nameI18n()" [value]="name()" (valueChange)="onFieldChange('name', $event)" autocomplete="organization" [maxLength]="shortNameLength" [readOnly]="isReadOnly()" />
                <okr-error-note [errors]="nameErrors()" />
              </ion-col>
              @if (isZefixLookupVisible()) {
                <ion-col size="2" class="ion-text-center">
                  <okr-zefix-lookup [i18n]="i18n()" [orgName]="name()" (detailsLoaded)="onZefixSelected($event)" />
                </ion-col>
              }
            </ion-row>
            <ion-row>
              <ion-col size="12" size-md="6">
                <okr-date-input [i18n]="dateOfFoundationI18n()" [storeDate]="dateOfFoundation()" (storeDateChange)="onFieldChange('dateOfFoundation', $event)" [readOnly]="isReadOnly()" />
                <okr-error-note [errors]="dateOfFoundationErrors()" />
              </ion-col>

              <ion-col size="12" size-md="6">
                <okr-date-input [i18n]="dateOfLiquidationI18n()" [storeDate]="dateOfLiquidation()" (storeDateChange)="onFieldChange('dateOfLiquidation', $event)" [readOnly]="isReadOnly()" />
                <okr-error-note [errors]="dateOfLiquidationErrors()" />
              </ion-col>
            </ion-row>
            <ion-row>
              <ion-col size="12" size-md="6">
                <okr-text-input [i18n]="taxIdI18n()" [value]="taxId()" (valueChange)="onFieldChange('taxId', $event)" [mask]="vatMask" [showHelper]=true [maxLength]="shortNameLength" [readOnly]="isReadOnly()" />
                <okr-error-note [errors]="taxIdErrors()" />
              </ion-col>
              @if(hasRole('admin')) { 
                <ion-col size="12" size-md="6">
                  <okr-text-input [i18n]="bexioIdI18n()" [value]="bexioId()" (valueChange)="onFieldChange('bexioId', $event)" [maxLength]="bexioIdLength" [mask]="bexioMask" [showHelper]=true [readOnly]="isReadOnly()" />
                  <okr-error-note [errors]="bexioIdErrors()" />
                </ion-col>
              }
            </ion-row>
          </ion-grid>
        </ion-card-content>
      </ion-card>

      @if(hasRole('privileged') || hasRole('memberAdmin')) {
        <okr-chips chipName="tag" [storedChips]="tags()" (storedChipsChange)="onFieldChange('tags', $event)" [allChips]="allTags()" [readOnly]="isReadOnly()" />
      }

      @if(hasRole('admin')) { 
        <okr-notes-input [i18n]="notesI18n()" [maxLength]="descriptionLength" [readOnly]="isReadOnly()" [value]="notes()" (valueChange)="onFieldChange('notes', $event)" [errors]="notesErrors()" />
      }
    </form>
  }
  `
})
export class OrgForm {
  /** kept in step with the cap the Vest suite enforces on this field */
  protected readonly bexioIdLength = BEXIO_ID_LENGTH;
  /** kept in step with the cap the Vest suite enforces on this field */
  protected readonly shortNameLength = SHORT_NAME_LENGTH;
  /** kept in step with the cap the Vest suite enforces on this field */
  protected readonly descriptionLength = DESCRIPTION_LENGTH;
  public readonly i18n = input.required<OrgI18n>();
  protected okeyI18n   = computed(() => ({ name: 'okey',   label: this.i18n().okey_label(),   placeholder: this.i18n().okey_placeholder(),   helper: this.i18n().okey_helper()   } as TextInputI18n));
  protected nameI18n   = computed(() => ({ name: 'name',   label: this.i18n().name_label(),   placeholder: this.i18n().name_placeholder(),   helper: this.i18n().name_helper()   } as TextInputI18n));
  protected taxIdI18n  = computed(() => ({ name: 'taxId',  label: this.i18n().taxId_label(),  placeholder: this.i18n().taxId_placeholder(),  helper: this.i18n().taxId_helper()  } as TextInputI18n));
  protected bexioIdI18n = computed(() => ({ name: 'bexioId', label: this.i18n().bexioId_label(), placeholder: this.i18n().bexioId_placeholder(), helper: this.i18n().bexioId_helper() } as TextInputI18n));
  protected notesI18n   = computed(() => ({ name: 'notes', label: this.i18n().notes_label(), placeholder: this.i18n().notes_placeholder() } as NotesInputI18n));
  protected dateOfFoundationI18n  = computed(() => ({ name: 'dateOfFoundation',  label: this.i18n().dateOfFoundation_label(),  placeholder: this.i18n().dateOfFoundation_placeholder(),  helper: this.i18n().dateOfFoundation_helper()  } as DateInputI18n));
  protected dateOfLiquidationI18n = computed(() => ({ name: 'dateOfLiquidation', label: this.i18n().dateOfLiquidation_label(), placeholder: this.i18n().dateOfLiquidation_placeholder(), helper: this.i18n().dateOfLiquidation_helper() } as DateInputI18n));

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
  protected isLegalEntity = computed(() => this.type() === 'legalEntity');
  protected isZefixLookupVisible = computed(() => this.isLegalEntity() && !this.isReadOnly());

  // signals
  public dirty = output<boolean>();
  public valid = output<boolean>();

  constructor() { effect(() => this.valid.emit(this.validationResult().isValid())); }

  // validation and errors
  private readonly validationResult = computed(() => orgValidations(this.formData(), this.tenantId(), this.allTags()));
  protected dateOfFoundationErrors = computed(() => this.validationResult().getErrors('dateOfFoundation'));
  protected dateOfLiquidationErrors = computed(() => this.validationResult().getErrors('dateOfLiquidation'));
  protected typeErrors = computed(() => this.validationResult().getErrors('type'));
  protected bexioIdErrors = computed(() => this.validationResult().getErrors('bexioId'));
  protected notesErrors = computed(() => this.validationResult().getErrors('notes'));
  protected taxIdErrors = computed(() => this.validationResult().getErrors('taxId'));
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
  protected okey = computed(() => this.formData().okey ?? '');

  // passing constants to template
  protected bexioMask = BexioIdMask;
  protected vatMask = ChVatMask;

  /******************************* actions *************************************** */
  protected onFieldChange(fieldName: string, fieldValue: string | number | boolean): void {
    this.dirty.emit(true);
    this.formData.update((vm) => ({ ...vm, [fieldName]: fieldValue }));
  }

  /**
   * Fills the form with the data found in the commercial register (Zefix).
   * In the edit form we never overwrite what is already there: only empty fields are
   * filled, and the Zefix notes (purpose, legal form) plus its address are APPENDED to
   * the existing notes (the org model has no address fields; they live in the addresses
   * accordion, so the address would otherwise be lost).
   */
  protected onZefixSelected(details: ZefixCompanyDetails): void {
    this.dirty.emit(true);
    this.formData.update((vm) => ({
      ...vm,
      name: fillIfEmpty(vm.name, details.name),
      taxId: fillIfEmpty(vm.taxId, details.taxId),
      notes: appendNotes(vm.notes, details),
    }));
  }

  protected hasRole(role: RoleName): boolean {
    return hasRole(role, this.currentUser());
  }
}

/** keeps an existing value, falls back to the looked-up one */
function fillIfEmpty(currentValue: string | undefined, newValue: string): string {
  const _current = (currentValue ?? '').trim();
  return _current.length > 0 ? _current : (newValue ?? '').trim();
}

/** appends the Zefix findings (purpose/legal form, address) to the existing notes */
function appendNotes(currentNotes: string | undefined, details: ZefixCompanyDetails): string {
  const _parts: string[] = [];
  const _notes = (details.notes ?? '').trim();
  if (_notes.length > 0) _parts.push(_notes);
  const _address = formatZefixAddress(details);
  if (_address.length > 0) _parts.push(_address);
  if (_parts.length === 0) return currentNotes ?? '';

  const _current = (currentNotes ?? '').trim();
  const _addition = _parts.join('\n');
  return _current.length > 0 ? `${_current}\n${_addition}` : _addition;
}

/** one-line rendering of the Zefix address, e.g. 'Zefix-Adresse: Bahnhofstrasse 1, 8001 Zuerich' */
function formatZefixAddress(details: ZefixCompanyDetails): string {
  const _street = [details.streetName, details.streetNumber].map((_v) => (_v ?? '').trim()).filter((_v) => _v.length > 0).join(' ');
  const _place = [details.zipCode, details.city].map((_v) => (_v ?? '').trim()).filter((_v) => _v.length > 0).join(' ');
  const _address = [_street, _place].filter((_v) => _v.length > 0).join(', ');
  return _address.length > 0 ? `Zefix-Adresse: ${_address}` : '';
}

import { Component, computed, effect, inject, input, model, output } from '@angular/core';
import { form } from '@angular/forms/signals';
import { IonButton, IonCard, IonCardContent, IonCol, IonGrid, IonIcon, IonItem, IonLabel, IonNote, IonRow } from '@ionic/angular';

import { UploadService } from '@okr/avatar-data-access';
import {
  formatInvoiceNo, TRAINER_MAX_PAYMENT_TERM_DAYS, TRAINER_NUMBER_TEMPLATE_LENGTH, TRAINER_VAT_NUMBER_LENGTH, TrainerBillingI18n, trainerProfileValidations
} from '@okr/finance-trainer-billing-util';
import { ENV } from '@okr/shared-config';
import { DESCRIPTION_LENGTH, IMAGE_MIMETYPES, NAME_LENGTH } from '@okr/shared-constants';
import { AddressModel, TrainerProfileModel } from '@okr/shared-models';
import { SvgIconPipe } from '@okr/shared-pipes';
import {
  Checkbox, CheckboxI18n, ErrorNote, ImgDirective, NumberInput, NumberInputI18n, StringSelect, StringSelectI18n, TextareaInput, TextInput, TextInputI18n
} from '@okr/shared-ui';
import { validateVestTree, vestErrors } from '@okr/shared-util-angular';
import { coerceBoolean, DateFormat, fill, getTodayStr, sanitizeFileName } from '@okr/shared-util-core';

/** `CH9300762011623852957` → `CH93 0076 2011 6238 5295 7`. */
function groupedIban(iban: string): string {
  return (iban ?? '').replace(/\s/g, '').replace(/(.{4})/g, '$1 ').trim();
}

/** `Seestrasse 12, 8712 Stäfa` — the empty parts left out. */
function postalLine(a: AddressModel): string {
  const street = `${a.streetName ?? ''} ${a.streetNumber ?? ''}`.trim();
  const place = `${a.zipCode ?? ''} ${a.city ?? ''}`.trim();
  return [street, place].filter(p => !!p).join(', ');
}

/**
 * The trainer's invoice profile (spec 1.167 §7.2): sender, letterhead address, bank account, logo, VAT, invoice
 * numbering, payment term and closing text. One profile per person for all clubs.
 *
 * The postal address and the bank account are chosen from the person's OWN addresses (the vault, owner-readable);
 * the IBAN is never copied into the profile, only the address key. New addresses are added in the person's profile:
 * the «add» link emits `addAddress` and the parent leads there. The logo is uploaded once as an original under the
 * person's upload prefix (`tenant/<tenant>/person/<personKey>/…`, the only prefix the invoice prints) and shown via imgix.
 * `nextNumber` and `tenants` are server-maintained and not part of this form.
 */
@Component({
  selector: 'okr-trainer-profile-form',
  standalone: true,
  imports: [
    TextInput, TextareaInput, NumberInput, Checkbox, StringSelect, ErrorNote, ImgDirective, SvgIconPipe,
    IonGrid, IonRow, IonCol, IonCard, IonCardContent, IonItem, IonLabel, IonNote, IonButton, IonIcon
  ],
  styles: [`
    @media (width <= 600px) { ion-card { margin: 5px; } }
    .logo { max-height: 80px; max-width: 240px; object-fit: contain; }
  `],
  template: `
    @if (showForm()) {
      <form novalidate>
        <ion-card>
          <ion-card-content class="ion-no-padding">
            <ion-grid>
              <ion-row>
                <ion-col size="12" size-md="6">
                  <okr-text-input [i18n]="companyNameI18n()" [value]="companyName()" (valueChange)="onFieldChange('companyName', $event)"
                    [autofocus]="true" [maxLength]="nameLength" [showHelper]="true" [readOnly]="isReadOnly()" />
                  <okr-error-note [errors]="companyNameErrors()" />
                </ion-col>
                <ion-col size="12" size-md="6">
                  <okr-text-input [i18n]="contactNameI18n()" [value]="contactName()" (valueChange)="onFieldChange('contactName', $event)"
                    [maxLength]="nameLength" [showHelper]="true" [readOnly]="isReadOnly()" />
                  <okr-error-note [errors]="contactNameErrors()" />
                </ion-col>
              </ion-row>
              <ion-row>
                <ion-col size="12" size-md="6">
                  @if (postalAddresses().length > 0) {
                    <okr-string-select [i18n]="postalI18n()" [stringList]="postalKeys()" [labels]="postalLabels()"
                      [selectedString]="postalAddressKey()" (selectedStringChange)="onFieldChange('postalAddressKey', $event)" [readOnly]="isReadOnly()" />
                  } @else {
                    <ion-item lines="none"><ion-note>{{ i18n().profile_postal_none() }}</ion-note></ion-item>
                  }
                  <okr-error-note [errors]="postalAddressKeyErrors()" />
                </ion-col>
                <ion-col size="12" size-md="6">
                  @if (bankAddresses().length > 0) {
                    <okr-string-select [i18n]="bankI18n()" [stringList]="bankKeys()" [labels]="bankLabels()"
                      [selectedString]="bankAddressKey()" (selectedStringChange)="onFieldChange('bankAddressKey', $event)" [readOnly]="isReadOnly()" />
                  } @else {
                    <ion-item lines="none"><ion-note>{{ i18n().profile_bank_none() }}</ion-note></ion-item>
                  }
                  <okr-error-note [errors]="bankAddressKeyErrors()" />
                </ion-col>
              </ion-row>
              @if (!isReadOnly()) {
                <ion-row>
                  <ion-col size="12">
                    <ion-button fill="clear" size="small" color="secondary" (click)="addAddress.emit()">
                      <ion-icon slot="start" src="{{ 'add' | svgIcon }}" />{{ i18n().profile_address_add() }}
                    </ion-button>
                  </ion-col>
                </ion-row>
              }
              <ion-row>
                <ion-col size="12">
                  <ion-item lines="none">
                    <ion-label class="ion-text-wrap">
                      <ion-note>{{ i18n().profile_logo_label() }}</ion-note>
                      @if (logoSrc(); as src) {
                        <div><img okrImg class="logo" [src]="src" [alt]="i18n().profile_logo_label()" /></div>
                      }
                      <p>{{ i18n().profile_logo_helper() }}</p>
                    </ion-label>
                    @if (!isReadOnly()) {
                      <ion-button slot="end" fill="clear" size="small" (click)="uploadLogo()">
                        <ion-icon slot="start" src="{{ 'upload' | svgIcon }}" />{{ i18n().profile_logo_upload() }}
                      </ion-button>
                      @if (logoUrl()) {
                        <ion-button slot="end" fill="clear" size="small" color="danger" (click)="onFieldChange('logoUrl', '')" [title]="i18n().profile_logo_remove()">
                          <ion-icon slot="icon-only" src="{{ 'trash' | svgIcon }}" />
                        </ion-button>
                      }
                    }
                  </ion-item>
                </ion-col>
              </ion-row>
            </ion-grid>
          </ion-card-content>
        </ion-card>

        <ion-card>
          <ion-card-content class="ion-no-padding">
            <ion-grid>
              <ion-row>
                <ion-col size="12" size-md="6">
                  <okr-text-input [i18n]="numberTemplateI18n()" [value]="numberTemplate()" (valueChange)="onFieldChange('numberTemplate', $event)"
                    [maxLength]="numberTemplateLength" [showHelper]="true" [readOnly]="isReadOnly()" />
                  <okr-error-note [errors]="numberTemplateErrors()" />
                  @if (numberExample(); as example) {
                    <ion-item lines="none"><ion-note>{{ example }}</ion-note></ion-item>
                  }
                </ion-col>
                <ion-col size="12" size-md="6">
                  <okr-number-input [i18n]="paymentTermI18n()" [value]="paymentTermDays()" (valueChange)="onFieldChange('paymentTermDays', $event)"
                    [integer]="true" [min]="0" [max]="maxPaymentTermDays" [showHelper]="true" [readOnly]="isReadOnly()" />
                  <okr-error-note [errors]="paymentTermDaysErrors()" />
                </ion-col>
              </ion-row>
              <ion-row>
                <ion-col size="12">
                  <okr-checkbox [i18n]="vatRegisteredI18n()" [checked]="vatRegistered()" (checkedChange)="onFieldChange('vatRegistered', $event)"
                    [showHelper]="true" [readOnly]="isReadOnly()" />
                </ion-col>
              </ion-row>
              <ion-row>
                <ion-col size="12">
                  @if (vatRegistered()) {
                    <okr-text-input [i18n]="vatNumberI18n()" [value]="vatNumber()" (valueChange)="onFieldChange('vatNumber', $event)"
                      [maxLength]="vatNumberLength" [readOnly]="isReadOnly()" />
                    <okr-error-note [errors]="vatNumberErrors()" />
                  } @else {
                    <okr-textarea-input [i18n]="vatNoteI18n()" [value]="vatNote()" (valueChange)="onFieldChange('vatNote', $event)"
                      [maxLength]="descriptionLength" [rows]="2" [readOnly]="isReadOnly()" />
                    <okr-error-note [errors]="vatNoteErrors()" />
                  }
                </ion-col>
              </ion-row>
              <ion-row>
                <ion-col size="12">
                  <okr-textarea-input [i18n]="closingTextI18n()" [value]="closingText()" (valueChange)="onFieldChange('closingText', $event)"
                    [maxLength]="descriptionLength" [rows]="2" [readOnly]="isReadOnly()" />
                  <okr-error-note [errors]="closingTextErrors()" />
                </ion-col>
              </ion-row>
              <ion-row>
                <ion-col size="12">
                  <okr-checkbox [i18n]="showQrSlipI18n()" [checked]="showQrSlip()" (checkedChange)="onFieldChange('showQrSlip', $event)"
                    [showHelper]="true" [readOnly]="isReadOnly()" />
                </ion-col>
              </ion-row>
            </ion-grid>
          </ion-card-content>
        </ion-card>
      </form>
    }
  `,
})
export class TrainerProfileForm {
  private readonly uploadService = inject(UploadService);
  private readonly imgixBaseUrl = inject(ENV).services.imgixBaseUrl;

  // inputs
  public readonly i18n = input.required<TrainerBillingI18n>();
  public readonly formData = model.required<TrainerProfileModel>();
  /** the person's own postal addresses (channel `postal`) */
  public readonly postalAddresses = input<AddressModel[]>([]);
  /** the person's own bank accounts (channel `bankaccount`) */
  public readonly bankAddresses = input<AddressModel[]>([]);
  /** the app tenant and the person: the logo is uploaded under `tenant/<tenantId>/person/<personKey>/` */
  public readonly tenantId = input.required<string>();
  public readonly personKey = input.required<string>();
  public readonly readOnly = input(true);
  public readonly showForm = input(true);   // toggled by the parent to reset the Vest state on cancel

  // outputs
  public readonly dirty = output<boolean>();
  public readonly valid = output<boolean>();
  /** the user wants to add a postal address or a bank account (in the person's profile) */
  public readonly addAddress = output<void>();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  protected readonly profileForm = form(this.formData, (path) => validateVestTree(path, trainerProfileValidations as any));
  private readonly validationResult = vestErrors(this.profileForm);
  protected readonly companyNameErrors = computed(() => this.validationResult().getErrors('companyName'));
  protected readonly contactNameErrors = computed(() => this.validationResult().getErrors('contactName'));
  protected readonly postalAddressKeyErrors = computed(() => this.validationResult().getErrors('postalAddressKey'));
  protected readonly bankAddressKeyErrors = computed(() => this.validationResult().getErrors('bankAddressKey'));
  protected readonly numberTemplateErrors = computed(() => this.validationResult().getErrors('numberTemplate'));
  protected readonly paymentTermDaysErrors = computed(() => this.validationResult().getErrors('paymentTermDays'));
  protected readonly vatNumberErrors = computed(() => this.validationResult().getErrors('vatNumber'));
  protected readonly vatNoteErrors = computed(() => this.validationResult().getErrors('vatNote'));
  protected readonly closingTextErrors = computed(() => this.validationResult().getErrors('closingText'));

  /** kept in step with the caps the Vest suite enforces */
  protected readonly nameLength = NAME_LENGTH;
  protected readonly numberTemplateLength = TRAINER_NUMBER_TEMPLATE_LENGTH;
  protected readonly vatNumberLength = TRAINER_VAT_NUMBER_LENGTH;
  protected readonly descriptionLength = DESCRIPTION_LENGTH;
  protected readonly maxPaymentTermDays = TRAINER_MAX_PAYMENT_TERM_DAYS;

  // fields (raw Firestore documents: coalesce)
  protected readonly isReadOnly = computed(() => coerceBoolean(this.readOnly()));
  protected readonly companyName = computed(() => this.formData().companyName ?? '');
  protected readonly contactName = computed(() => this.formData().contactName ?? '');
  protected readonly postalAddressKey = computed(() => this.formData().postalAddressKey ?? '');
  protected readonly bankAddressKey = computed(() => this.formData().bankAddressKey ?? '');
  protected readonly logoUrl = computed(() => this.formData().logoUrl ?? '');
  protected readonly vatRegistered = computed(() => this.formData().vatRegistered ?? false);
  protected readonly vatNumber = computed(() => this.formData().vatNumber ?? '');
  protected readonly vatNote = computed(() => this.formData().vatNote ?? '');
  protected readonly numberTemplate = computed(() => this.formData().numberTemplate ?? '');
  protected readonly paymentTermDays = computed(() => this.formData().paymentTermDays ?? 30);
  protected readonly closingText = computed(() => this.formData().closingText ?? '');
  protected readonly showQrSlip = computed(() => this.formData().showQrSlip ?? true);

  protected readonly postalKeys = computed(() => ['', ...this.postalAddresses().map(a => a.okey)]);
  protected readonly postalLabels = computed(() => ['—', ...this.postalAddresses().map(a => postalLine(a))]);
  protected readonly bankKeys = computed(() => ['', ...this.bankAddresses().map(a => a.okey)]);
  protected readonly bankLabels = computed(() => ['—', ...this.bankAddresses().map(a => groupedIban(a.iban))]);

  /** the logo through imgix as PNG (the PDF renders it the same way); never the raw storage file */
  protected readonly logoSrc = computed(() => this.logoUrl() ? `${this.imgixBaseUrl}/${this.logoUrl()}?fm=png&h=160` : '');
  /** the number the template would give this month, with the counter at 1 */
  protected readonly numberExample = computed(() => {
    const template = this.numberTemplate();
    if (!template) return '';
    const today = getTodayStr(DateFormat.StoreDate);
    const month = `${today.slice(0, 4)}-${today.slice(4, 6)}`;
    return fill(this.i18n().profile_numberTemplate_example(), { example: formatInvoiceNo(template, month, 1) });
  });

  protected readonly companyNameI18n = computed(() => ({
    name: 'companyName', label: this.i18n().profile_companyName_label(), placeholder: this.i18n().profile_companyName_placeholder(),
    helper: this.i18n().profile_companyName_helper(),
  } as TextInputI18n));
  protected readonly contactNameI18n = computed(() => ({
    name: 'contactName', label: this.i18n().profile_contactName_label(), placeholder: this.i18n().profile_contactName_placeholder(),
    helper: this.i18n().profile_contactName_helper(),
  } as TextInputI18n));
  protected readonly postalI18n = computed(() => ({
    name: 'postalAddressKey', label: this.i18n().profile_postal_label(), helper: this.i18n().profile_postal_helper(),
  } as StringSelectI18n));
  protected readonly bankI18n = computed(() => ({
    name: 'bankAddressKey', label: this.i18n().profile_bank_label(), helper: this.i18n().profile_bank_helper(),
  } as StringSelectI18n));
  protected readonly numberTemplateI18n = computed(() => ({
    name: 'numberTemplate', label: this.i18n().profile_numberTemplate_label(), placeholder: this.i18n().profile_numberTemplate_placeholder(),
    helper: this.i18n().profile_numberTemplate_helper(),
  } as TextInputI18n));
  protected readonly paymentTermI18n = computed(() => ({
    name: 'paymentTermDays', label: this.i18n().profile_paymentTerm_label(), placeholder: this.i18n().profile_paymentTerm_placeholder(),
    helper: this.i18n().profile_paymentTerm_helper(),
  } as NumberInputI18n));
  protected readonly vatRegisteredI18n = computed(() => ({
    name: 'vatRegistered', label: this.i18n().profile_vatRegistered_label(), helper: this.i18n().profile_vatRegistered_helper(),
  } as CheckboxI18n));
  protected readonly vatNumberI18n = computed(() => ({
    name: 'vatNumber', label: this.i18n().profile_vatNumber_label(), placeholder: this.i18n().profile_vatNumber_placeholder(), helper: '',
  } as TextInputI18n));
  protected readonly vatNoteI18n = computed(() => ({
    name: 'vatNote', label: this.i18n().profile_vatNote_label(), placeholder: this.i18n().profile_vatNote_placeholder(), helper: '',
  } as TextInputI18n));
  protected readonly closingTextI18n = computed(() => ({
    name: 'closingText', label: this.i18n().profile_closingText_label(), placeholder: this.i18n().profile_closingText_placeholder(), helper: '',
  } as TextInputI18n));
  protected readonly showQrSlipI18n = computed(() => ({
    name: 'showQrSlip', label: this.i18n().profile_showQrSlip_label(), helper: this.i18n().profile_showQrSlip_helper(),
  } as CheckboxI18n));

  constructor() {
    effect(() => this.valid.emit(this.profileForm().valid()));
  }

  protected onFieldChange(fieldName: keyof TrainerProfileModel, fieldValue: string | number | boolean): void {
    this.dirty.emit(true);
    this.formData.update(vm => ({ ...vm, [fieldName]: fieldValue }));
  }

  /**
   * One original, shown via imgix (images skill). SVG is not offered: imgix cannot read it (logo skill), so it would
   * never print. The file picker is opened first, synchronously in the click, for Safari's user activation.
   */
  protected async uploadLogo(): Promise<void> {
    if (this.isReadOnly()) return;
    const file = await this.uploadService.pickFile(IMAGE_MIMETYPES);
    if (!file) return;
    const fullPath = `tenant/${this.tenantId()}/person/${this.personKey()}/trainer-logo/${sanitizeFileName(file.name)}`;
    const url = await this.uploadService.uploadFile(file, fullPath, this.i18n().profile_logo_uploadTitle());
    if (!url) return;
    this.onFieldChange('logoUrl', fullPath);
  }
}

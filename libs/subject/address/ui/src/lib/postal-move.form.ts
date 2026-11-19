import { Component, computed, effect, input, model, output, signal } from '@angular/core';
import { form } from '@angular/forms/signals';
import { IonButton, IonCard, IonCardContent, IonCol, IonGrid, IonItem, IonLabel, IonList, IonNote, IonRow, IonSpinner } from '@ionic/angular';

import { CITY_LENGTH, DEFAULT_COUNTRY, NAME_LENGTH, NUMBER_LENGTH, SHORT_NAME_LENGTH } from '@okr/shared-constants';
import { CountrySelect, CountrySelectI18n, DateInput, DateInputI18n, ErrorNote, TextInput, TextInputI18n } from '@okr/shared-ui';
import { validateVestTree, vestErrors } from '@okr/shared-util-angular';
import { coerceBoolean } from '@okr/shared-util-core';

import { AddressesI18n, ManualAddressInput, PostalMoveFormModel, PostalMoveMode, postalMoveValidations, SwissAddressHit } from '@okr/subject-address-util';

/** Where the swisstopo search stands; the parent runs the search and passes the result back in. */
export type PostalSearchState = 'idle' | 'searching' | 'done' | 'error';

/**
 * Move / correction form (spec 1.164 §6.2): country, swisstopo search (CH) or manual fields, c/o line
 * and — in the move modes — «Gültig ab». Dumb: the parent debounces and runs the search
 * (`queryChange` → `hits` / `searchState`) and saves via its change-confirmation.
 */
@Component({
  selector: 'okr-postal-move-form',
  standalone: true,
  imports: [
    CountrySelect, DateInput, ErrorNote, TextInput,
    IonButton, IonCard, IonCardContent, IonCol, IonGrid, IonItem, IonLabel, IonList, IonNote, IonRow, IonSpinner,
  ],
  styles: [`
    @media (width <= 600px) { ion-card { margin: 5px;} }
    .attribution { font-size: 0.75em; padding: 0 16px 8px; }
  `],
  template: `
  @if (showForm()) {
  <form novalidate>
    <ion-card>
      <ion-card-content class="ion-no-padding">
        <ion-grid>
          <ion-row>
            <ion-col size="12" size-md="6">
              <okr-country-select [i18n]="countryCodeI18n()" [value]="countryCode()" (valueChange)="onCountryChange($event)" [readOnly]="isReadOnly()" />
            </ion-col>
          </ion-row>

          @if (isManual()) {
            @if (searchState() === 'error') {
              <ion-row>
                <ion-col size="12">
                  <ion-item lines="none"><ion-note color="warning">{{ i18n().move_search_error() }}</ion-note></ion-item>
                </ion-col>
              </ion-row>
            }
            <ion-row>
              <ion-col size="8" size-md="9">
                <okr-text-input [i18n]="streetNameI18n()" [value]="manual().streetName" (valueChange)="onManualChange('streetName', $event)" [autofocus]="true" [maxLength]="nameLength" [readOnly]="isReadOnly()" autocomplete="address-line1" />
                <okr-error-note [errors]="streetNameErrors()" />
              </ion-col>
              <ion-col size="4" size-md="3">
                <okr-text-input [i18n]="streetNumberI18n()" [value]="manual().streetNumber" (valueChange)="onManualChange('streetNumber', $event)" [maxLength]="numberLength" [readOnly]="isReadOnly()" />
                <okr-error-note [errors]="streetNumberErrors()" />
              </ion-col>
            </ion-row>
            <ion-row>
              <ion-col size="12" size-md="4">
                <okr-text-input [i18n]="zipCodeI18n()" [value]="manual().zipCode" (valueChange)="onManualChange('zipCode', $event)" [readOnly]="isReadOnly()" autocomplete="postal-code" />
                <okr-error-note [errors]="zipCodeErrors()" />
              </ion-col>
              <ion-col size="12" size-md="8">
                <okr-text-input [i18n]="cityI18n()" [value]="manual().city" (valueChange)="onManualChange('city', $event)" [maxLength]="cityLength" [readOnly]="isReadOnly()" autocomplete="address-level2" />
                <okr-error-note [errors]="cityErrors()" />
              </ion-col>
            </ion-row>
            @if (isSwiss() && searchState() !== 'error' && !isReadOnly()) {
              <ion-row>
                <ion-col size="12">
                  <ion-button fill="clear" size="small" (click)="setManual(false)">{{ i18n().move_back_to_search() }}</ion-button>
                </ion-col>
              </ion-row>
            }
          } @else {
            @if (hit(); as hit) {
              <ion-row>
                <ion-col size="12">
                  <ion-item lines="none">
                    <ion-label>{{ hit.streetName }} {{ hit.streetNumber }}, {{ hit.zipCode }} {{ hit.city }}</ion-label>
                  </ion-item>
                  @if (!isReadOnly()) {
                    <ion-button fill="clear" size="small" (click)="clearHit()">{{ i18n().move_search_change() }}</ion-button>
                  }
                </ion-col>
              </ion-row>
            } @else {
              <ion-row>
                <ion-col size="12">
                  <okr-text-input [i18n]="queryI18n()" [value]="query()" (valueChange)="onQueryChange($event)" [autofocus]="true" [maxLength]="queryLength" [readOnly]="isReadOnly()" />
                  @switch (searchState()) {
                    @case ('searching') {
                      <ion-item lines="none"><ion-spinner name="dots" /><ion-note>&nbsp;{{ i18n().move_search_searching() }}</ion-note></ion-item>
                    }
                    @case ('done') {
                      @if (hits().length === 0) {
                        <ion-item lines="none"><ion-note>{{ i18n().move_search_empty() }}</ion-note></ion-item>
                      } @else {
                        <ion-list lines="inset">
                          @for (h of hits(); track h.egaid) {
                            <ion-item button [detail]="false" (click)="chooseHit(h)">
                              <ion-label>{{ h.streetName }} {{ h.streetNumber }}, {{ h.zipCode }} {{ h.city }}</ion-label>
                            </ion-item>
                          }
                        </ion-list>
                        <ion-item lines="none"><ion-note>{{ i18n().move_search_choose() }}</ion-note></ion-item>
                      }
                    }
                  }
                  <div class="attribution"><ion-note>{{ i18n().move_search_attribution() }}</ion-note></div>
                  @if (!isReadOnly()) {
                    <ion-button fill="clear" size="small" (click)="setManual(true)">{{ i18n().move_not_found() }}</ion-button>
                  }
                </ion-col>
              </ion-row>
            }
          }

          <ion-row>
            <ion-col size="12">
              <okr-text-input [i18n]="addressValue2I18n()" [value]="addressValue2()" (valueChange)="onFieldChange('addressValue2', $event)" [maxLength]="shortNameLength" [readOnly]="isReadOnly()" />
              <okr-error-note [errors]="addressValue2Errors()" />
            </ion-col>
          </ion-row>

          @if (mode() !== 'correct') {
            <ion-row>
              <ion-col size="12" size-md="6">
                <okr-date-input [i18n]="validFromI18n()" [storeDate]="validFrom()" (storeDateChange)="onFieldChange('validFrom', $event)" [readOnly]="isReadOnly()" />
                <okr-error-note [errors]="validFromErrors()" />
              </ion-col>
            </ion-row>
          }
        </ion-grid>
      </ion-card-content>
    </ion-card>
  </form>
  }
  `,
})
export class PostalMoveForm {
  /** kept in step with the cap the Vest suite enforces on this field */
  protected readonly nameLength = NAME_LENGTH;
  /** kept in step with the cap the Vest suite enforces on this field */
  protected readonly numberLength = NUMBER_LENGTH;
  /** kept in step with the cap the Vest suite enforces on this field */
  protected readonly cityLength = CITY_LENGTH;
  /** kept in step with the cap the Vest suite enforces on this field */
  protected readonly shortNameLength = SHORT_NAME_LENGTH;
  /** the search text is not validated; the server accepts up to 200 characters */
  protected readonly queryLength = 200;

  // inputs
  public readonly i18n = input.required<AddressesI18n>();
  public readonly formData = model.required<PostalMoveFormModel>();
  public readonly mode = input.required<PostalMoveMode>();
  public readonly hits = input<SwissAddressHit[]>([]);
  public readonly searchState = input<PostalSearchState>('idle');
  public readonly showForm = input(true);   // toggled by the parent to reset the form on cancel
  public readonly readOnly = input(false);
  protected readonly isReadOnly = computed(() => coerceBoolean(this.readOnly()));

  // outputs
  public readonly dirty = output<boolean>();
  public readonly valid = output<boolean>();
  /** the search text changed; the parent decides whether (≥ 3 characters) and when (debounced) to search */
  public readonly queryChange = output<string>();

  // «Adresse nicht gefunden» was chosen; a foreign country or a failed search are manual as well
  private readonly manualChosen = signal(false);

  // validation
  private readonly suiteWithContext = (m: PostalMoveFormModel) => postalMoveValidations(m, this.mode());
  protected readonly moveForm = form(this.formData, (path) =>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    validateVestTree(path, this.suiteWithContext as any));
  private readonly validationResult = vestErrors(this.moveForm);
  protected readonly validFromErrors = computed(() => this.validationResult().getErrors('validFrom'));
  protected readonly addressValue2Errors = computed(() => this.validationResult().getErrors('addressValue2'));
  protected readonly streetNameErrors = computed(() => this.validationResult().getErrors('manual.streetName'));
  protected readonly streetNumberErrors = computed(() => this.validationResult().getErrors('manual.streetNumber'));
  protected readonly zipCodeErrors = computed(() => this.validationResult().getErrors('manual.zipCode'));
  protected readonly cityErrors = computed(() => this.validationResult().getErrors('manual.city'));

  constructor() {
    effect(() => this.valid.emit(this.moveForm().valid()));
  }

  // fields
  protected readonly countryCode = computed(() => this.formData().countryCode || DEFAULT_COUNTRY);
  protected readonly isSwiss = computed(() => this.countryCode() === 'CH');
  protected readonly isManual = computed(() => !this.isSwiss() || this.manualChosen() || this.searchState() === 'error');
  protected readonly query = computed(() => this.formData().query ?? '');
  protected readonly hit = computed(() => this.formData().hit);
  protected readonly manual = computed(() => this.formData().manual);
  protected readonly addressValue2 = computed(() => this.formData().addressValue2 ?? '');
  protected readonly validFrom = computed(() => this.formData().validFrom ?? '');

  // i18n
  protected readonly countryCodeI18n = computed(() => ({ name: 'countryCode', label: this.i18n().countryCode_label(), search: this.i18n().countryCode_search(), helper: this.i18n().countryCode_helper(), empty: this.i18n().countryCode_empty() } as CountrySelectI18n));
  protected readonly queryI18n = computed(() => ({ name: 'query', label: this.i18n().move_search_label(), placeholder: this.i18n().move_search_placeholder(), helper: this.i18n().move_search_helper() } as TextInputI18n));
  protected readonly streetNameI18n = computed(() => ({ name: 'streetName', label: this.i18n().streetName_label(), placeholder: this.i18n().streetName_placeholder(), helper: this.i18n().streetName_helper() } as TextInputI18n));
  protected readonly streetNumberI18n = computed(() => ({ name: 'streetNumber', label: this.i18n().streetNumber_label(), placeholder: this.i18n().streetNumber_placeholder(), helper: this.i18n().streetNumber_helper() } as TextInputI18n));
  protected readonly zipCodeI18n = computed(() => ({ name: 'zipCode', label: this.i18n().zipCode_label(), placeholder: this.i18n().zipCode_placeholder(), helper: this.i18n().zipCode_helper() } as TextInputI18n));
  protected readonly cityI18n = computed(() => ({ name: 'city', label: this.i18n().city_label(), placeholder: this.i18n().city_placeholder(), helper: this.i18n().city_helper() } as TextInputI18n));
  protected readonly addressValue2I18n = computed(() => ({ name: 'addressValue2', label: this.i18n().move_addressValue2_label(), placeholder: this.i18n().move_addressValue2_placeholder(), helper: this.i18n().move_addressValue2_helper() } as TextInputI18n));
  protected readonly validFromI18n = computed(() => ({ name: 'validFrom', label: this.i18n().move_validFrom_label(), placeholder: this.i18n().move_validFrom_placeholder(), helper: this.i18n().move_validFrom_helper() } as DateInputI18n));

  /******************************* actions *************************************** */
  /** A new country empties what belonged to the old one; outside CH the address is typed by hand. */
  protected onCountryChange(countryCode: string): void {
    this.dirty.emit(true);
    this.formData.update((vm) => ({
      ...vm,
      countryCode,
      query: '',
      hit: undefined,
      manual: { ...vm.manual, zipCode: '', city: '', countryCode },
    }));
  }

  protected onQueryChange(query: string): void {
    this.dirty.emit(true);
    this.formData.update((vm) => ({ ...vm, query, hit: undefined }));
    this.queryChange.emit(query);
  }

  protected chooseHit(hit: SwissAddressHit): void {
    this.dirty.emit(true);
    this.formData.update((vm) => ({ ...vm, hit, query: hit.label }));
  }

  protected clearHit(): void {
    this.formData.update((vm) => ({ ...vm, hit: undefined }));
  }

  /** «Adresse nicht gefunden» (true) or back to the search (false); a hand-typed address never carries a hit. */
  protected setManual(manual: boolean): void {
    this.manualChosen.set(manual);
    this.formData.update((vm) => ({
      ...vm,
      hit: undefined,
      // back to the search: forget the typed fields, so only a chosen hit can make the form valid
      manual: manual ? vm.manual : { streetName: '', streetNumber: '', zipCode: '', city: '', countryCode: vm.countryCode },
    }));
  }

  protected onManualChange(fieldName: keyof ManualAddressInput, value: string): void {
    this.dirty.emit(true);
    this.formData.update((vm) => ({ ...vm, hit: undefined, manual: { ...vm.manual, [fieldName]: value } }));
  }

  protected onFieldChange(fieldName: 'addressValue2' | 'validFrom', value: string): void {
    this.dirty.emit(true);
    this.formData.update((vm) => ({ ...vm, [fieldName]: value }));
  }
}

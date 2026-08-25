import { Component, computed, inject, input, model, signal, viewChild } from '@angular/core';
import { IonButton, IonButtons, IonIcon, IonInput, IonItem, IonLabel, IonList, IonModal, IonNote, IonSearchbar, IonTitle, IonToolbar } from '@ionic/angular/standalone';

import { I18nService } from '@okr/shared-i18n';
import { SvgIconPipe } from '@okr/shared-pipes';
import { coerceBoolean, getSortedCountries } from '@okr/shared-util-core';

export interface CountrySelectI18n {
  name: string;
  label: string;
  helper?: string;
  /** placeholder of the searchbar within the country modal */
  search?: string;
  /** shown when the search term matches no country */
  empty?: string;
}

/**
 * Select a country (ISO 3166-1 alpha-2 code).
 *
 * The list is shown in a modal that is wide enough for the full country name and
 * carries a searchbar; the search matches the country code as well as the
 * localized country name. The countries are sorted by their code (AD, AE, ...).
 */
@Component({
  selector: 'okr-country-select',
  standalone: true,
  imports: [
    SvgIconPipe,
    IonItem, IonInput, IonNote, IonIcon, IonModal, IonToolbar,
    IonTitle, IonButtons, IonButton, IonSearchbar, IonList, IonLabel
  ],
  styles: [`
    ion-item.helper { --min-height: 0; }
    ion-modal.country {
      --width: 92%;
      --max-width: 520px;
      --height: 80%;
      --border-radius: 8px;
      --border-width: 1px;
      --border-style: solid;
      --border-color: var(--ion-color-medium, #92949c);
      --box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
      --background: var(--ion-background-color, #fff);
    }
    /* own flex layout instead of ion-header/ion-content: an inline modal nested in
       another modal does not reliably get Ionic's .ion-page sizing, which left the
       result list invisible */
    .country-picker {
      display: flex;
      flex-direction: column;
      height: 100%;
      background: var(--ion-background-color, #fff);
    }
    .country-results { flex: 1 1 auto; overflow-y: auto; }
  `],
  template: `
    <ion-item lines="none" [button]="!isReadOnly()" [detail]="false" (click)="open()">
      <ion-input
        [name]="i18n().name"
        type="text"
        label="{{ i18n().label }}"
        labelPlacement="floating"
        [value]="displayValue()"
        [readonly]="true"
        [clearInput]="false"
      />
      @if (!isReadOnly()) {
        <ion-icon slot="end" src="{{ 'chevron-expand' | svgIcon }}" aria-hidden="true" />
      }
    </ion-item>
    @if (i18n().helper && showHelper()) {
      <ion-item lines="none" class="helper" [button]="false">
        <ion-note>{{ i18n().helper }}</ion-note>
      </ion-item>
    }

    <ion-modal class="country" [isOpen]="isOpen()" (ionModalDidDismiss)="close()" (ionModalDidPresent)="focusSearch()">
      <ng-template>
        <div class="country-picker">
          <ion-toolbar color="primary">
            <ion-title>{{ i18n().label }}</ion-title>
            <ion-buttons slot="end">
              <ion-button (click)="close()">
                <ion-icon slot="icon-only" src="{{ 'cancel' | svgIcon }}" />
              </ion-button>
            </ion-buttons>
          </ion-toolbar>
          <ion-searchbar #countrySearch
            type="search" inputmode="search" show-clear-button="always"
            [debounce]="0" [placeholder]="i18n().search ?? ''"
            (ionInput)="onSearchtermChange($event)"
          />
          <div class="country-results">
            <ion-list>
              @for (country of filteredCountries(); track country.code) {
                <ion-item button="true" detail="false" (click)="select(country.code)">
                  <ion-label>{{ country.code }} — {{ country.name }}</ion-label>
                </ion-item>
              } @empty {
                <ion-item lines="none"><ion-label>{{ i18n().empty ?? '' }}</ion-label></ion-item>
              }
            </ion-list>
          </div>
        </div>
      </ng-template>
    </ion-modal>
  `
})
export class CountrySelect {
  private readonly i18nService = inject(I18nService);

  // model
  public value = model.required<string>(); // ISO 3166-1 alpha-2 country code, e.g. CH

  // inputs
  public i18n = input.required<CountrySelectI18n>();
  public readOnly = input.required<boolean>();
  public showHelper = input(false);

  // coerced boolean inputs
  protected isReadOnly = computed(() => coerceBoolean(this.readOnly()));

  protected isOpen = signal(false);
  protected searchTerm = signal('');
  protected countrySearch = viewChild<IonSearchbar>('countrySearch');

  protected readonly countries = computed(() => getSortedCountries(this.i18nService.getActiveLang()));

  /** the form field shows the ISO code only; the full name is shown in the modal */
  protected readonly displayValue = computed(() => (this.value() ?? '').toUpperCase());

  protected readonly filteredCountries = computed(() => {
    const _term = this.searchTerm().trim().toLowerCase();
    if (_term.length === 0) return this.countries();
    return this.countries().filter((country) =>
      country.code.toLowerCase().startsWith(_term) || country.name.toLowerCase().includes(_term));
  });

  protected open(): void {
    if (this.isReadOnly()) return;
    this.searchTerm.set('');
    this.isOpen.set(true);
  }

  protected close(): void {
    this.isOpen.set(false);
  }

  protected focusSearch(): void {
    setTimeout(() => this.countrySearch()?.setFocus(), 100);
  }

  protected onSearchtermChange($event: Event): void {
    this.searchTerm.set(($event.target as HTMLInputElement).value ?? '');
  }

  protected select(countryCode: string): void {
    this.value.set(countryCode);
    this.close();
  }
}

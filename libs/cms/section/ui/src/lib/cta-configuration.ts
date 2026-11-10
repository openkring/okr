import { Component, computed, input, model, Signal } from '@angular/core';
import {
  IonButton, IonCard, IonCardContent, IonCardHeader, IonCardSubtitle, IonCardTitle, IonCol, IonGrid, IonIcon, IonItem,
  IonLabel, IonNote, IonRow, IonSelect, IonSelectOption
} from '@ionic/angular';

import { NAME_LENGTH, URL_LENGTH } from '@okr/shared-constants';
import { SECTION_CTA_STYLES, SectionCta, SectionCtaStyle } from '@okr/shared-models';
import { ErrorNote, TextInput, TextInputI18n } from '@okr/shared-ui';
import { SvgIconPipe } from '@okr/shared-pipes';
import { fill } from '@okr/shared-util-core';
import { getFieldErrors, SectionErrors } from '@okr/cms-section-util';

interface CtaConfigI18n {
  cta_title:              Signal<string>;
  cta_subtitle:           Signal<string>;
  cta_button:             Signal<string>;
  cta_empty:              Signal<string>;
  cta_add:                Signal<string>;
  cta_remove:             Signal<string>;
  cta_label_label:        Signal<string>;
  cta_label_placeholder:  Signal<string>;
  cta_label_helper:       Signal<string>;
  cta_url_label:          Signal<string>;
  cta_url_placeholder:    Signal<string>;
  cta_url_helper:         Signal<string>;
  cta_style_label:        Signal<string>;
  cta_style_primary:      Signal<string>;
  cta_style_secondary:    Signal<string>;
}

/**
 * Call-to-action buttons of a hero (up to two) or an article (one): label, link and look per button.
 * Only the plain German label is edited; translations live in `labelI18n` and are left untouched.
 *
 * Error names differ by owner: a hero validates `ctas` and `ctas[i].label`, an article its single
 * `cta.label` — `errorKey` picks the scheme.
 */
@Component({
  selector: 'okr-cta-config',
  standalone: true,
  imports: [
    TextInput, ErrorNote, SvgIconPipe,
    IonCard, IonCardHeader, IonCardTitle, IonCardSubtitle, IonCardContent, IonGrid, IonRow, IonCol,
    IonSelect, IonSelectOption, IonButton, IonIcon, IonItem, IonLabel, IonNote
  ],
  styles: [`
    @media (width <= 600px) { ion-card { margin: 5px; } }
    .cta-head { display: flex; align-items: center; justify-content: space-between; margin-top: 8px; }
    .cta-head h3 { margin: 0px; font-size: 1rem; }
  `],
  template: `
    <ion-card>
      <ion-card-header>
        <ion-card-title>{{ i18n().cta_title() }}</ion-card-title>
        <ion-card-subtitle>{{ i18n().cta_subtitle() }}</ion-card-subtitle>
      </ion-card-header>
      <ion-card-content>
        <okr-error-note [errors]="errorsFor('ctas')" />
        <ion-grid>
          @for (cta of ctas(); track $index; let i = $index) {
            <ion-row>
              <ion-col size="12" class="cta-head">
                <h3>{{ buttonTitle(i) }}</h3>
                @if (!readOnly()) {
                  <ion-button fill="clear" color="danger" [attr.aria-label]="i18n().cta_remove()" (click)="remove(i)">
                    <ion-icon slot="icon-only" src="{{ 'trash' | svgIcon }}" />
                  </ion-button>
                }
              </ion-col>
              <ion-col size="12" size-md="6">
                <okr-text-input [i18n]="labelI18n()" [value]="cta.label ?? ''" (valueChange)="patch(i, { label: $event })"
                                [maxLength]="labelLength" [readOnly]="readOnly()" [showHelper]="true" />
                <okr-error-note [errors]="errorsFor(field(i, 'label'))" />
              </ion-col>
              <ion-col size="12" size-md="6">
                <ion-select [label]="i18n().cta_style_label()" labelPlacement="stacked"
                            [value]="cta.style ?? 'primary'" [disabled]="readOnly()"
                            (ionChange)="patch(i, { style: $event.detail.value })">
                  @for (s of styles; track s) {
                    <ion-select-option [value]="s">{{ styleLabels()[s] }}</ion-select-option>
                  }
                </ion-select>
              </ion-col>
              <ion-col size="12">
                <okr-text-input [i18n]="urlI18n()" [value]="cta.url ?? ''" (valueChange)="patch(i, { url: $event })"
                                [maxLength]="urlLength" [readOnly]="readOnly()" [showHelper]="true" inputMode="url" />
                <okr-error-note [errors]="errorsFor(field(i, 'url'))" />
              </ion-col>
            </ion-row>
          } @empty {
            <ion-item lines="none"><ion-label><ion-note>{{ i18n().cta_empty() }}</ion-note></ion-label></ion-item>
          }
        </ion-grid>
        @if (!readOnly() && ctas().length < max()) {
          <ion-button expand="block" fill="clear" (click)="add()">
            <ion-icon slot="start" src="{{ 'add' | svgIcon }}" />
            {{ i18n().cta_add() }}
          </ion-button>
        }
      </ion-card-content>
    </ion-card>
  `
})
export class CtaConfiguration {
  public formData = model.required<SectionCta[]>();
  /** how many buttons the owner allows: 2 for a hero, 1 for an article */
  public readonly max = input<number>(1);
  /** vest naming scheme of the owner: 'ctas' → `ctas[i].label`, 'cta' → `cta.label` */
  public readonly errorKey = input<'ctas' | 'cta'>('ctas');
  public readonly readOnly = input(true);
  public readonly i18n = input.required<CtaConfigI18n>();
  /** vest field name -> messages of the running section suite (see section.form.ts) */
  public readonly errors = input<SectionErrors>({});

  protected readonly styles = SECTION_CTA_STYLES;
  protected readonly labelLength = NAME_LENGTH;
  protected readonly urlLength = URL_LENGTH;

  protected readonly ctas = computed(() => this.formData() ?? []);

  protected readonly styleLabels = computed<Record<SectionCtaStyle, string>>(() => ({
    primary: this.i18n().cta_style_primary(), secondary: this.i18n().cta_style_secondary(),
  }));

  protected readonly labelI18n = computed(() => ({
    name: 'ctaLabel', label: this.i18n().cta_label_label(),
    placeholder: this.i18n().cta_label_placeholder(), helper: this.i18n().cta_label_helper(),
  } as TextInputI18n));

  protected readonly urlI18n = computed(() => ({
    name: 'ctaUrl', label: this.i18n().cta_url_label(),
    placeholder: this.i18n().cta_url_placeholder(), helper: this.i18n().cta_url_helper(),
  } as TextInputI18n));

  protected buttonTitle(index: number): string {
    return fill(this.i18n().cta_button(), { n: index + 1 });
  }

  protected field(index: number, name: 'label' | 'url'): string {
    return this.errorKey() === 'cta' ? `cta.${name}` : `ctas[${index}].${name}`;
  }

  protected errorsFor(field: string): string[] {
    return getFieldErrors(this.errors(), field);
  }

  protected patch(index: number, changes: Partial<SectionCta>): void {
    this.formData.set(this.ctas().map((cta, i) => (i === index ? { ...cta, ...changes } : cta)));
  }

  protected add(): void {
    if (this.readOnly() || this.ctas().length >= this.max()) return;
    const style: SectionCtaStyle = this.ctas().length === 0 ? 'primary' : 'secondary';
    this.formData.set([...this.ctas(), { label: '', url: '', style }]);
  }

  protected remove(index: number): void {
    if (this.readOnly()) return;
    this.formData.set(this.ctas().filter((_, i) => i !== index));
  }
}

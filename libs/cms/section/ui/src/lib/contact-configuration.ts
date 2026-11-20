import { Component, computed, input, model, output } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import {
  IonButton, IonCard, IonCardContent, IonCardHeader, IonCardSubtitle, IonCardTitle, IonCol, IonGrid, IonIcon,
  IonItem, IonLabel, IonNote, IonRow
} from '@ionic/angular';

import { ContactConfig, ContactFormField, ContactFormFieldName } from '@okr/shared-models';
import { Checkbox, CheckboxI18n, ErrorNote } from '@okr/shared-ui';
import { SvgIconPipe } from '@okr/shared-pipes';
import { ContactDetails, ContactParty, getFieldErrors, normalizeContactConfig, SectionErrors, SectionI18n } from '@okr/cms-section-util';

import { ContactLayoutEditor } from './contact-layout-editor';

/**
 * Configuration of a contact section, as up to four cards:
 * 1. Kontakt — pick the organization and the contact person; their details show side by side
 *    (logo/avatar, name, postal address, email, phone, read live from the address book), plus
 *    the switches «Karte anzeigen» and «Kontakt-Formular anzeigen».
 * 2. Kontakt-Formular — only while the form is on: which fields show and which are required.
 * 3. Layout — drag the blocks (title, subtitle, info fields, map, form) into place.
 * Part of section.form: the parent owns validation and saving; the pickers are opened by the
 * parent (`orgSelectClicked` / `personSelectClicked`), the details are resolved by the feature layer.
 */
@Component({
  selector: 'okr-contact-config',
  standalone: true,
  imports: [
    NgTemplateOutlet, SvgIconPipe, Checkbox, ErrorNote, ContactLayoutEditor,
    IonCard, IonCardHeader, IonCardTitle, IonCardSubtitle, IonCardContent, IonGrid, IonRow, IonCol,
    IonButton, IonIcon, IonItem, IonLabel, IonNote
  ],
  styles: [`
    @media (width <= 600px) { ion-card { margin: 5px; } }
    .party { display: flex; gap: 12px; align-items: flex-start; padding: 8px 0; }
    .party img, .party .placeholder { width: 72px; height: 72px; flex: none; object-fit: cover; border-radius: 6px;
                                      background: var(--ion-color-light); }
    .party .placeholder { display: flex; align-items: center; justify-content: center; color: var(--ion-color-medium); font-size: 2rem; }
    .party .logo { object-fit: contain; }
    .party .lines { min-width: 0; line-height: 1.5; }
    .party .name { font-weight: 600; }
    .party .muted { color: var(--ion-color-medium); }
    .party .line { display: flex; gap: 6px; align-items: center; overflow-wrap: anywhere; }
    .party .line ion-icon { flex: none; color: var(--ion-color-medium); }
    .heading { font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.04em; color: var(--ion-color-medium); }
    .fields { display: grid; grid-template-columns: 1fr auto auto; align-items: center; column-gap: 8px; }
    .fields .head { font-size: 0.8rem; color: var(--ion-color-medium); }
  `],
  template: `
    <!-- 1 · info card -->
    <ion-card>
      <ion-card-header>
        <ion-card-title>{{ i18n().contact_title() }}</ion-card-title>
        <ion-card-subtitle>{{ i18n().contact_subtitle() }}</ion-card-subtitle>
      </ion-card-header>
      <ion-card-content>
        <ion-grid>
          <ion-row>
            <ion-col size="12" size-md="6">
              <div class="heading">{{ i18n().contact_org_label() }}</div>
              <ng-container *ngTemplateOutlet="party; context: { $implicit: details().org, logo: true, empty: i18n().contact_org_empty() }" />
              <ion-button fill="outline" size="small" [disabled]="readOnly()" (click)="orgSelectClicked.emit()">
                <ion-icon slot="start" src="{{ 'search' | svgIcon }}" />{{ i18n().contact_org_select() }}
              </ion-button>
            </ion-col>
            <ion-col size="12" size-md="6">
              <div class="heading">{{ i18n().contact_person_label() }}</div>
              <ng-container *ngTemplateOutlet="party; context: { $implicit: details().person, logo: false, empty: i18n().contact_person_empty() }" />
              <ion-button fill="outline" size="small" [disabled]="readOnly()" (click)="personSelectClicked.emit()">
                <ion-icon slot="start" src="{{ 'search' | svgIcon }}" />{{ i18n().contact_person_select() }}
              </ion-button>
            </ion-col>
          </ion-row>
          <ion-row>
            <ion-col size="12">
              <ion-item lines="none"><ion-note>{{ i18n().contact_privacy_hint() }}</ion-note></ion-item>
            </ion-col>
            <ion-col size="12" size-md="6">
              <okr-checkbox [i18n]="showMapI18n()" [checked]="config().showMap" (checkedChange)="onFieldChange('showMap', $event)"
                            [showHelper]="true" [readOnly]="readOnly()" />
            </ion-col>
            <ion-col size="12" size-md="6">
              <okr-checkbox [i18n]="showFormI18n()" [checked]="config().showForm" (checkedChange)="onFieldChange('showForm', $event)"
                            [showHelper]="true" [readOnly]="readOnly()" />
            </ion-col>
          </ion-row>
        </ion-grid>
      </ion-card-content>
    </ion-card>

    <!-- 2 · contact form fields, only while the form is on -->
    @if(config().showForm) {
      <ion-card>
        <ion-card-header>
          <ion-card-title>{{ i18n().contact_form_title() }}</ion-card-title>
          <ion-card-subtitle>{{ i18n().contact_form_subtitle() }}</ion-card-subtitle>
        </ion-card-header>
        <ion-card-content>
          <div class="fields">
            <span class="head"></span>
            <span class="head">{{ i18n().contact_form_visible() }}</span>
            <span class="head">{{ i18n().contact_form_required() }}</span>
            @for(field of config().formFields; track field.name) {
              <ion-label>{{ fieldLabel(field.name) }}</ion-label>
              <okr-checkbox [i18n]="fieldCheckI18n()[field.name].visible" [checked]="field.isVisible"
                            (checkedChange)="onFormFieldChange(field.name, 'isVisible', $event)" [readOnly]="readOnly()" />
              <okr-checkbox [i18n]="fieldCheckI18n()[field.name].required" [checked]="field.isRequired"
                            (checkedChange)="onFormFieldChange(field.name, 'isRequired', $event)" [readOnly]="readOnly() || !field.isVisible" />
            }
          </div>
          <okr-error-note [errors]="errorsFor('contact.formFields')" />
        </ion-card-content>
      </ion-card>
    }

    <!-- 3 · layout -->
    <ion-card>
      <ion-card-header>
        <ion-card-title>{{ i18n().contact_layout_title() }}</ion-card-title>
        <ion-card-subtitle>{{ i18n().contact_layout_subtitle() }}</ion-card-subtitle>
      </ion-card-header>
      <ion-card-content>
        <okr-contact-layout-editor [config]="config()" (configChange)="formData.set($event)"
          [details]="details()" [title]="title()" [subTitle]="subTitle()" [readOnly]="readOnly()" [i18n]="i18n()" />
        <okr-error-note [errors]="errorsFor('contact.rows')" />
        <okr-error-note [errors]="errorsFor('contact.layout')" />
      </ion-card-content>
    </ion-card>

    <ng-template #party let-party let-logo="logo" let-empty="empty">
      @if(asParty(party); as p) {
        <div class="party">
          @if(p.imageUrl) { <img [src]="p.imageUrl" [class.logo]="logo" alt="" /> }
          @else { <div class="placeholder"><ion-icon src="{{ (logo ? 'group' : 'person') | svgIcon }}" /></div> }
          <div class="lines">
            <div class="name">{{ p.name }}</div>
            @for(line of p.addressLines; track $index) { <div class="line">{{ line }}</div> }
            @if(p.email) { <div class="line"><ion-icon src="{{ 'email' | svgIcon }}" />{{ p.email }}</div> }
            @if(p.phone) { <div class="line"><ion-icon src="{{ 'tel' | svgIcon }}" />{{ p.phone }}</div> }
          </div>
        </div>
      } @else {
        <div class="party"><span class="muted">{{ empty }}</span></div>
      }
    </ng-template>
  `
})
export class ContactConfiguration {
  public formData = model.required<ContactConfig>();
  public readonly details = input<ContactDetails>({});
  /** the base section's title and subtitle — layout blocks too */
  public readonly title = input('');
  public readonly subTitle = input('');
  public readonly readOnly = input(true);
  public readonly i18n = input.required<SectionI18n>();
  public readonly errors = input<SectionErrors>({});

  public readonly orgSelectClicked = output<void>();
  public readonly personSelectClicked = output<void>();

  /** legacy or hand-edited documents are made safe before the editor sees them */
  protected readonly config = computed(() => normalizeContactConfig(this.formData()));

  protected readonly showMapI18n = computed(() => ({
    name: 'showMap', label: this.i18n().contact_showMap_label(), helper: this.i18n().contact_showMap_helper(),
  } as CheckboxI18n));
  protected readonly showFormI18n = computed(() => ({
    name: 'showForm', label: this.i18n().contact_showForm_label(), helper: this.i18n().contact_showForm_helper(),
  } as CheckboxI18n));

  /** per field: the two checkboxes carry the field name in their label for screen readers */
  protected readonly fieldCheckI18n = computed(() => {
    const result = {} as Record<ContactFormFieldName, { visible: CheckboxI18n; required: CheckboxI18n }>;
    for (const field of this.config().formFields) {
      const label = this.fieldLabel(field.name);
      result[field.name] = {
        visible: { name: `${field.name}Visible`, label: `${label}: ${this.i18n().contact_form_visible()}`, helper: '' },
        required: { name: `${field.name}Required`, label: `${label}: ${this.i18n().contact_form_required()}`, helper: '' },
      };
    }
    return result;
  });

  protected asParty(party: unknown): ContactParty | undefined {
    return party as ContactParty | undefined;
  }

  protected fieldLabel(name: ContactFormFieldName): string {
    return this.i18n()[`contact_field_${name}` as keyof SectionI18n]();
  }

  protected onFieldChange(field: 'showMap' | 'showForm', value: boolean): void {
    this.formData.set({ ...this.config(), [field]: value });
  }

  protected onFormFieldChange(name: ContactFormFieldName, flag: keyof Omit<ContactFormField, 'name'>, value: boolean): void {
    const formFields = this.config().formFields.map(f => {
      if (f.name !== name) return f;
      const next = { ...f, [flag]: value };
      if (!next.isVisible) next.isRequired = false; // a hidden field cannot be required
      return next;
    });
    this.formData.set({ ...this.config(), formFields });
  }

  protected errorsFor(field: string): string[] {
    return getFieldErrors(this.errors(), field);
  }
}

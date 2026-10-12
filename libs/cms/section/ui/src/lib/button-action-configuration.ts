import { Component, computed, input, linkedSignal, model, Signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  IonCard, IonCardContent, IonCardHeader, IonCardSubtitle, IonCardTitle, IonCol, IonGrid, IonNote, IonRow, IonSelect, IonSelectOption,
} from '@ionic/angular';

import { ButtonAction, ButtonActionConfig } from '@okr/shared-models';
import { CategoryOld, CategoryOldI18n, ErrorNote, TextInput, TextInputI18n } from '@okr/shared-ui';
import { SectionErrors, getFieldErrors } from '@okr/cms-section-util';
import { DEFAULT_LABEL, DEFAULT_URL, URL_LENGTH } from '@okr/shared-constants';
import { ButtonActions } from '@okr/shared-categories';

interface ButtonActionI18n {
  button_action_title:                  Signal<string>;
  button_action_subtitle:               Signal<string>;
  url_label:                            Signal<string>;
  url_placeholder:                      Signal<string>;
  url_helper:                           Signal<string>;
  altText_label:                        Signal<string>;
  altText_placeholder:                  Signal<string>;
  altText_helper:                       Signal<string>;
  button_action_label:                  Signal<string>;
  button_action_intro:                  Signal<string>;
  contract_document_label:              Signal<string>;
  contract_document_helper:             Signal<string>;
}

/** A contract a ButtonAction.ContractDocument button can point at (spec 1.97). */
export interface ContractOption { okey: string; name: string; }

@Component({
  selector: 'okr-button-action',
  standalone: true,
  imports: [
    FormsModule,
    TextInput, CategoryOld,
    IonCard, IonCardHeader, IonCardTitle, IonCardContent, IonGrid, IonRow, IonCol, IonCardSubtitle, IonSelect, IonSelectOption, IonNote,
    ErrorNote
  ],
  styles: [`@media (width <= 600px) { ion-card { margin: 5px;} }`],
  template: `
    <ion-card>
      <ion-card-header>
        <ion-card-title>{{ i18n().button_action_title() }}</ion-card-title>
        <ion-card-subtitle>{{ i18n().button_action_subtitle() }}</ion-card-subtitle>
      </ion-card-header>
      <ion-card-content>
        @if(introHtml(); as intro) {
          @if(intro.length > 0) {
            <small><div [innerHTML]="intro"></div></small>
          }
        }

        <ion-grid>
          <ion-row>
            <ion-col size="12" size-md="6">
              <okr-category-old [i18n]="buttonActionI18n()" [value]="type()" (valueChange)="onFieldChange('type', $event)" [categories]="buttonActions" [readOnly]="readOnly()" />
            </ion-col>
            @if(type() === BA.ContractDocument && contracts().length > 0) {
              <!-- spec 1.97: the contractKey is picked, never typed (it is a foreign key) -->
              <ion-col size="12" size-md="6">
                <ion-select [label]="i18n().contract_document_label()" labelPlacement="stacked" interface="popover"
                            [value]="url()" [disabled]="readOnly()" (ionChange)="onFieldChange('url', $event.detail.value)">
                  @for (c of contracts(); track c.okey) {
                    <ion-select-option [value]="c.okey">{{ c.name }}</ion-select-option>
                  }
                </ion-select>
                <ion-note>{{ i18n().contract_document_helper() }}</ion-note>
                <okr-error-note [errors]="errorsFor('action.url')" />
              </ion-col>
            } @else if(type() !== BA.None) {
              <!-- also the ContractDocument fallback for an editor who may not list contracts: the key is typed -->
              <ion-col size="12" size-md="6">
                <okr-text-input [i18n]="actionUrlI18n()" [value]="url()" (valueChange)="onFieldChange('url', $event)" [readOnly]="readOnly()" [maxLength]="urlLength" />
                <okr-error-note [errors]="errorsFor('action.url')" />
              </ion-col>
            }
            <ion-col size="12" size-md="6">
              <okr-text-input [i18n]="altTextI18n()" [value]="altText()" (valueChange)="onFieldChange('altText', $event)" [readOnly]="readOnly()" [maxLength]=400 />
              <okr-error-note [errors]="errorsFor('action.altText')" />
            </ion-col>
          </ion-row>
        </ion-grid>
      </ion-card-content>
    </ion-card>
  `
})
export class ButtonActionConfiguration {
  /** vest field name -> messages of the running section suite (see section.form.ts) */
  public readonly errors = input<SectionErrors>({});


  // inputs
  public formData = model.required<ButtonActionConfig>();
  public readonly i18n = input.required<ButtonActionI18n>();
  /** Optional override; defaults to the translated action-type explainer. */
  public intro = input<string>();
  protected readonly introHtml = computed(() => this.intro() ?? this.i18n().button_action_intro());

  public readonly readOnly = input(true);
  /** contracts the editor may pick for a ContractDocument button; empty = the key is typed instead */
  public readonly contracts = input<ContractOption[]>([]);

  // fields
  protected type = linkedSignal(() => this.formData().type ?? ButtonAction.Download);
  protected url = linkedSignal(() => this.formData().url ?? DEFAULT_URL);
  protected altText = linkedSignal(() => this.formData().altText ?? DEFAULT_LABEL);

  // passing constants to template
  protected BA = ButtonAction;
  /** kept in step with the cap the Vest suite enforces on action.url */
  protected readonly urlLength = URL_LENGTH;
  protected buttonActions = ButtonActions;



  protected actionUrlI18n = computed(() => ({
    name: 'actionUrl',
    label: this.i18n().url_label(),
    placeholder: this.i18n().url_placeholder(),
    helper: this.i18n().url_helper(),
  } as TextInputI18n));

  protected altTextI18n = computed(() => ({
    name: 'altText',
    label: this.i18n().altText_label(),
    placeholder: this.i18n().altText_placeholder(),
    helper: this.i18n().altText_helper(),
  } as TextInputI18n));
  protected buttonActionI18n = computed(() => ({ name: 'buttonAction', label: this.i18n().button_action_label() } as CategoryOldI18n));

  protected onFieldChange(fieldName: string, $event: string | string[] | number): void {
    this.formData.update((vm) => ({ ...vm, [fieldName]: $event }));
  }

  /** messages of a single field, for the inline <okr-error-note> */
  protected errorsFor(field: string): string[] {
    return getFieldErrors(this.errors(), field);
  }
}

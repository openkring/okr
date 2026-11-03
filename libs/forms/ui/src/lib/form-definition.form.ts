import { Component, computed, effect, input, model, output } from '@angular/core';
import { form } from '@angular/forms/signals';
import {
  IonCard, IonCardContent, IonCardHeader, IonCardSubtitle, IonCardTitle, IonCol, IonGrid, IonItem, IonLabel, IonList, IonNote, IonRow,
} from '@ionic/angular';

import { DESCRIPTION_LENGTH, LONG_NAME_LENGTH, URL_LENGTH } from '@okr/shared-constants';
import { ApplicationCollection, CategoryListModel, ConfirmationVariant, DerivedValue, FormDefinitionModel, FormMapping, SubmissionTarget } from '@okr/shared-models';
import {
  ErrorNote, NotesInput, NotesInputI18n, RadioGroup, RadioGroupI18n,
  StringSelect, StringSelectI18n, TextInput, TextInputI18n,
} from '@okr/shared-ui';
import { coerceBoolean, fill } from '@okr/shared-util-core';
import { validateVestTree, vestErrors } from '@okr/shared-util-angular';

import {
  AcceptanceFields, derivedKeysSetByMapping, DerivedValuesModel, derivedValuesValidations, errorsUnder, firstEmailField, FORM_MAPPINGS, FormI18n,
  formDefinitionValidations, getFormMapping, getPrefillFields,
} from '@okr/forms-util';

import { AcceptanceSettingsInput } from './acceptance-settings.input';
import { ConfirmationSettingsInput } from './confirmation-settings.input';
import { DerivedValuesInput } from './derived-values.input';

const TARGET_KINDS: SubmissionTarget['kind'][] = ['collection', 'url'];

/**
 * Settings of a form definition: name, description, key, submission target, PDF template, the help text for
 * the people filling it in, the «Berechnete Werte», «Nach dem Absenden» and «Annahme». The parent modal drives saving.
 */
@Component({
  selector: 'okr-form-definition-form',
  standalone: true,
  imports: [
    ErrorNote, TextInput, NotesInput, RadioGroup, StringSelect, DerivedValuesInput, ConfirmationSettingsInput, AcceptanceSettingsInput,
    IonGrid, IonRow, IonCol, IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonCardSubtitle, IonList, IonItem, IonLabel, IonNote,
  ],
  styles: [`@media (width <= 600px) { ion-card { margin: 5px;} }`],
  template: `
    @if (showForm()) {
      <form novalidate>
        <ion-card>
          <ion-card-content class="ion-no-padding">
            <ion-grid>
              @if (fieldsErrors().length > 0) {
                <!-- the fields are edited in the form builder; a repeated key blocks saving here too, so say why up front -->
                <ion-row>
                  <ion-col size="12">
                    <okr-error-note [errors]="fieldsErrors()" />
                  </ion-col>
                </ion-row>
              }
              <ion-row>
                <ion-col size="12" size-md="6">
                  <okr-text-input [i18n]="nameI18n()" [value]="name()" (valueChange)="onFieldChange('name', $event)"
                    [autofocus]="true" [maxLength]="longNameLength" [readOnly]="isReadOnly()" />
                  <okr-error-note [errors]="nameErrors()" />
                </ion-col>
                @if (mode() === 'edit') {
                  <ion-col size="12" size-md="6">
                    <!-- the form key is generated on creation and never changes -->
                    <okr-text-input [i18n]="formKeyI18n()" [value]="formKey()" [readOnly]="true" />
                  </ion-col>
                }
              </ion-row>
              <ion-row>
                <ion-col size="12">
                  <okr-notes-input [i18n]="descriptionI18n()" [value]="description()" (valueChange)="onFieldChange('description', $event)"
                    [maxLength]="descriptionLength" [readOnly]="isReadOnly()" [errors]="descriptionErrors()" />
                </ion-col>
              </ion-row>
              <ion-row>
                <ion-col size="12" size-md="6">
                  <okr-radio-group [i18n]="targetKindI18n()" [stringList]="targetKinds" [labels]="targetKindLabels()"
                    [selectedString]="targetKind()" (selectedStringChange)="setTargetKind($event)" [readOnly]="isReadOnly()" />
                </ion-col>
                <ion-col size="12" size-md="6">
                  @if (targetKind() === 'collection') {
                    <okr-string-select [i18n]="collectionI18n()" [stringList]="mappingKeys" [labels]="mappingLabels"
                      [selectedString]="collectionMappingKey()" (selectedStringChange)="setMappingKey($event)" [readOnly]="isReadOnly()" />
                    <okr-error-note [errors]="mappingKeyErrors()" />
                  } @else {
                    <okr-text-input [i18n]="urlI18n()" [value]="urlTarget()" (valueChange)="setUrl($event)"
                      inputMode="url" [maxLength]="urlLength" [readOnly]="isReadOnly()" />
                    <okr-error-note [errors]="urlErrors()" />
                  }
                </ion-col>
              </ion-row>
              <ion-row>
                <ion-col size="12" size-md="6">
                  <okr-text-input [i18n]="pdfTemplateI18n()" [value]="pdfTemplateId()" (valueChange)="onFieldChange('pdfTemplateId', $event)"
                    [readOnly]="isReadOnly()" />
                </ion-col>
              </ion-row>
              <ion-row>
                <ion-col size="12">
                  <okr-notes-input [i18n]="fillerHelpTextI18n()" [value]="fillerHelpText()" (valueChange)="onFieldChange('fillerHelpText', $event)"
                    [maxLength]="descriptionLength" [encryptable]="false" [readOnly]="isReadOnly()" [errors]="fillerHelpTextErrors()" />
                </ion-col>
              </ion-row>
            </ion-grid>
          </ion-card-content>
        </ion-card>

        <!-- «Berechnete Werte» (spec §6): set from the answers, never typed by the filler -->
        <ion-card>
          <ion-card-header>
            <ion-card-title>{{ i18n().derived_title() }}</ion-card-title>
            <ion-card-subtitle>{{ i18n().derived_intro() }}</ion-card-subtitle>
          </ion-card-header>
          <ion-card-content class="ion-no-padding">
            <okr-derived-values-input [derived]="derivedValues()" (derivedChange)="onDerivedChange($event)"
              [fields]="fields()" [categories]="categories()" [i18n]="i18n()" [errors]="derivedErrors()"
              [showProperty]="hasProperties()" [keysSetByMapping]="keysSetByMapping()" [readOnly]="isReadOnly()" />
          </ion-card-content>
        </ion-card>

        <!-- «Nach dem Absenden» (spec §10): the thank-you text, per-answer variants, the mail to the filler -->
        <ion-card>
          <ion-card-header>
            <ion-card-title>{{ i18n().after_title() }}</ion-card-title>
          </ion-card-header>
          <ion-card-content class="ion-no-padding">
            <okr-confirmation-settings-input
              [message]="confirmationMessage()" (messageChange)="onSettingChange('confirmationMessage', $event)"
              [variants]="confirmationVariants()" (variantsChange)="onSettingChange('confirmationVariants', $event)"
              [sendFillerConfirmation]="sendFillerConfirmation()" (sendFillerConfirmationChange)="onSettingChange('sendFillerConfirmation', $event)"
              [fields]="fields()" [hasEmailField]="hasEmailField()" [isApplicationMapping]="isApplicationMapping()"
              [categories]="categories()" [i18n]="i18n()" [errors]="allErrors()" [readOnly]="isReadOnly()" />
          </ion-card-content>
        </ion-card>

        <!-- «Annahme» (spec §11): open by hand, closing date, limit with «7 von 8 Antworten», closed text -->
        <ion-card>
          <ion-card-header>
            <ion-card-title>{{ i18n().accept_title() }}</ion-card-title>
          </ion-card-header>
          <ion-card-content class="ion-no-padding">
            <okr-acceptance-settings-input [settings]="acceptance()" (settingsChange)="onAcceptanceChange($event)"
              [count]="responseCount()" [i18n]="i18n()" [errors]="allErrors()" [readOnly]="isReadOnly()" />
          </ion-card-content>
        </ion-card>

        <!-- read-only preview of the fields (prefilled from the selected collection, edited in the form builder) -->
        @if (fields().length > 0) {
          <ion-card>
            <ion-card-content class="ion-no-padding">
              <ion-list lines="full">
                <ion-item lines="none">
                  <ion-label><ion-note>{{ fieldsLabel() }}</ion-note></ion-label>
                </ion-item>
                @for (field of fields(); track field.id) {
                  <ion-item>
                    <ion-label>
                      {{ field.label }}
                      @if (field.required) { <span style="color: var(--ion-color-danger);">*</span> }
                    </ion-label>
                    <ion-note slot="end">{{ field.type }}</ion-note>
                  </ion-item>
                }
              </ion-list>
            </ion-card-content>
          </ion-card>
        }
      </form>
    }
  `,
})
export class FormDefinitionForm {
  /** kept in step with the caps the Vest suite enforces on these fields */
  protected readonly longNameLength = LONG_NAME_LENGTH;
  protected readonly descriptionLength = DESCRIPTION_LENGTH;
  protected readonly urlLength = URL_LENGTH;

  protected readonly targetKinds = TARGET_KINDS;
  protected readonly mappingKeys = FORM_MAPPINGS.map(m => m.mappingKey);
  protected readonly mappingLabels = FORM_MAPPINGS.map(m => m.label);

  // inputs
  public readonly i18n = input.required<FormI18n>();
  public formData = model.required<FormDefinitionModel>();
  /** create: picking a collection replaces the field preview with its template; edit: saved fields are kept */
  public readonly mode = input<'create' | 'edit'>('edit');
  /** the category lists, for the items of a category field in a derived value's condition */
  public readonly categories = input<CategoryListModel[]>([]);
  /** accepted responses so far (`formStats/{okey}`), for «7 von 8 Antworten»; null = unknown (or a new form) */
  public readonly responseCount = input<number | null>(null);
  public readonly readOnly = input(false);
  public readonly showForm = input(true);

  // outputs
  public readonly dirty = output<boolean>();
  public readonly valid = output<boolean>();

  // signal form — wraps formData with Vest validation: the settings suite, and the «Berechnete Werte» suite,
  // which needs the derived values together with the fields (legacy docs have no derivedValues: coalesce)
  private readonly derivedSuite = (model: FormDefinitionModel) =>
    derivedValuesValidations({ derivedValues: model.derivedValues ?? [], fields: model.fields ?? [] } satisfies DerivedValuesModel);
  protected readonly formDefinitionForm = form(this.formData, (path) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    validateVestTree(path, formDefinitionValidations as any);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    validateVestTree(path, this.derivedSuite as any);
  });

  // per-field Vest errors for the notes under each field
  private readonly validationResult = vestErrors(this.formDefinitionForm);
  protected nameErrors = computed(() => this.validationResult().getErrors('name'));
  protected descriptionErrors = computed(() => this.validationResult().getErrors('description'));
  protected mappingKeyErrors = computed(() => this.validationResult().getErrors('target.mappingKey'));
  protected urlErrors = computed(() => this.validationResult().getErrors('target.url'));
  protected fillerHelpTextErrors = computed(() => this.validationResult().getErrors('fillerHelpText'));
  /** spans all fields: two input fields with the same key (edited in the form builder) */
  protected fieldsErrors = computed(() => this.validationResult().getErrors('fields'));
  /** the derived values' errors, keyed relative to the list — the card shows them under each of its controls */
  protected derivedErrors = computed(() => errorsUnder(this.validationResult().getErrors(), 'derivedValues.'));
  /** «Nach dem Absenden» and «Annahme» read their own keys (`confirmationMessage`, `maxResponses`, …) off the same run */
  protected allErrors = computed(() => this.validationResult().getErrors());

  constructor() {
    effect(() => this.valid.emit(this.formDefinitionForm().valid()));
  }

  // computed field accessors
  protected readonly isReadOnly = computed(() => coerceBoolean(this.readOnly()));
  protected readonly name = computed(() => this.formData().name ?? '');
  protected readonly description = computed(() => this.formData().description ?? '');
  protected readonly formKey = computed(() => this.formData().formKey ?? '');
  protected readonly pdfTemplateId = computed(() => this.formData().pdfTemplateId ?? '');
  protected readonly fields = computed(() => this.formData().fields ?? []);
  protected readonly fillerHelpText = computed(() => this.formData().fillerHelpText ?? '');
  protected readonly derivedValues = computed(() => this.formData().derivedValues ?? []);
  /** the chosen collection mapping (undefined for a URL target) */
  private readonly mapping = computed<FormMapping | undefined>(() => {
    const target = this.formData().target;
    return target?.kind === 'collection' ? getFormMapping(target.mappingKey) : undefined;
  });
  /** only a mapping with typed properties offers «Als eigene Angabe speichern» */
  protected readonly hasProperties = computed(() => !!this.mapping()?.propertiesField);
  protected readonly keysSetByMapping = computed(() => derivedKeysSetByMapping(this.derivedValues(), this.mapping()));
  /** «Bestätigung per E-Mail senden» needs an e-mail field */
  protected readonly hasEmailField = computed(() => firstEmailField(this.fields()) !== undefined);
  /** an application form: the back office's own confirmation mail is not sent as well (hint) */
  protected readonly isApplicationMapping = computed(() => this.mapping()?.collectionName === ApplicationCollection);
  // «Nach dem Absenden» and «Annahme» — legacy docs lack them (reads skip model defaults): coalesce
  protected readonly confirmationMessage = computed(() => this.formData().confirmationMessage ?? '');
  protected readonly confirmationVariants = computed(() => this.formData().confirmationVariants ?? []);
  protected readonly sendFillerConfirmation = computed(() => this.formData().sendFillerConfirmation === true);
  protected readonly acceptance = computed<AcceptanceFields>(() => {
    const fd = this.formData();
    return {
      isOpen: fd.isOpen !== false, closesAt: fd.closesAt ?? '', maxResponses: fd.maxResponses ?? 0,
      showRemaining: fd.showRemaining === true, closedMessage: fd.closedMessage ?? '',
    };
  });
  protected readonly targetKind = computed(() => this.formData().target.kind);
  protected readonly collectionMappingKey = computed(() => {
    const target = this.formData().target;
    return target.kind === 'collection' ? target.mappingKey : '';
  });
  protected readonly urlTarget = computed(() => {
    const target = this.formData().target;
    return target.kind === 'url' ? target.url : '';
  });
  protected readonly fieldsLabel = computed(() => fill(this.i18n().def_fields(), { count: this.fields().length }));

  // i18n for the shared/ui primitives
  protected readonly nameI18n = computed<TextInputI18n>(() => ({
    name: 'name', label: this.i18n().def_name(), placeholder: this.i18n().def_name_placeholder(), helper: '',
  }));
  protected readonly formKeyI18n = computed<TextInputI18n>(() => ({
    name: 'formKey', label: this.i18n().form_key(), placeholder: '', helper: '',
  }));
  protected readonly descriptionI18n = computed<NotesInputI18n>(() => ({
    name: 'description', label: this.i18n().description(), placeholder: '',
  }));
  protected readonly targetKindI18n = computed<RadioGroupI18n>(() => ({
    name: 'targetKind', label: this.i18n().def_target_kind(),
  }));
  protected readonly targetKindLabels = computed(() => [this.i18n().target_collection(), this.i18n().def_target_url_short()]);
  protected readonly collectionI18n = computed<StringSelectI18n>(() => ({
    name: 'mappingKey', label: this.i18n().def_collection(),
  }));
  protected readonly urlI18n = computed<TextInputI18n>(() => ({
    name: 'url', label: this.i18n().url_label(), placeholder: 'https://…', helper: '',
  }));
  protected readonly pdfTemplateI18n = computed<TextInputI18n>(() => ({
    name: 'pdfTemplateId', label: this.i18n().def_pdf_template(), placeholder: this.i18n().def_pdf_template_ph(), helper: '',
  }));
  protected readonly fillerHelpTextI18n = computed<NotesInputI18n>(() => ({
    name: 'fillerHelpText', label: this.i18n().def_filler_help(), placeholder: this.i18n().def_filler_help_ph(),
  }));

  protected onFieldChange(fieldName: 'name' | 'description' | 'pdfTemplateId' | 'fillerHelpText', fieldValue: string): void {
    this.dirty.emit(true);
    this.formData.update((vm) => ({ ...vm, [fieldName]: fieldValue }));
  }

  protected onSettingChange(name: 'confirmationMessage' | 'confirmationVariants' | 'sendFillerConfirmation', value: string | ConfirmationVariant[] | boolean): void {
    this.dirty.emit(true);
    this.formData.update((vm) => ({ ...vm, [name]: value }));
  }

  protected onAcceptanceChange(settings: Partial<AcceptanceFields>): void {
    this.dirty.emit(true);
    this.formData.update((vm) => ({ ...vm, ...settings }));
  }

  protected onDerivedChange(derivedValues: DerivedValue[]): void {
    this.dirty.emit(true);
    this.formData.update((vm) => ({ ...vm, derivedValues }));
  }

  protected setTargetKind(kind: string): void {
    const fd = this.formData();
    // ignore an echo of the current kind so it doesn't wipe the selected mapping
    if (fd.target.kind === kind || (kind !== 'collection' && kind !== 'url')) return;
    const target: SubmissionTarget = kind === 'collection'
      ? { kind: 'collection', mappingKey: '', modelType: '', collectionName: '' }
      : { kind: 'url', url: '' };
    this.dirty.emit(true);
    this.formData.set({ ...fd, target });
  }

  protected setMappingKey(mappingKey: string): void {
    const mapping = FORM_MAPPINGS.find(m => m.mappingKey === mappingKey);
    if (!mapping) return;
    const fd = this.formData();
    if (fd.target.kind === 'collection' && fd.target.mappingKey === mappingKey) return;
    // In create mode the field list is a read-only preview, so swap it to the
    // selected collection's template. In edit mode never clobber saved fields.
    const fields = this.mode() === 'create' ? getPrefillFields(mappingKey) : fd.fields;
    this.dirty.emit(true);
    this.formData.set({
      ...fd,
      fields,
      target: { kind: 'collection', mappingKey, modelType: mapping.modelType, collectionName: mapping.collectionName },
    });
  }

  protected setUrl(url: string): void {
    this.dirty.emit(true);
    this.formData.update((fd) => ({ ...fd, target: { kind: 'url', url } }));
  }
}

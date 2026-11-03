import { Component, computed, effect, input, linkedSignal, model, output, untracked } from '@angular/core';
import { form } from '@angular/forms/signals';
import { IonCard, IonCardContent, IonCol, IonGrid, IonItem, IonNote, IonRow } from '@ionic/angular';

import { LONG_NAME_LENGTH, NAME_LENGTH } from '@okr/shared-constants';
import { BaseType, CategoryListModel, Field, FormMapping, PropertyType, VisibilityRule } from '@okr/shared-models';
import {
  Checkbox, CheckboxI18n, ErrorNote, NotesInput, NotesInputI18n,
  StringSelect, StringSelectI18n, TextInput, TextInputI18n,
} from '@okr/shared-ui';
import { coerceBoolean, fill, isPrefillable, isSsnField, propertyTypeOf } from '@okr/shared-util-core';
import { validateVestTree, vestErrors } from '@okr/shared-util-angular';

import {
  canAllowOther, defaultFromText, errorsUnder, fieldConfigValidations, fieldLabelLength, FormI18n, isDisplayField, propertyTypeLabel,
} from '@okr/forms-util';

import { VisibilityRuleInput } from './visibility-rule.input';

const FIELD_WIDTHS: Field['width'][] = ['full', 'half', 'third'];
/** «Art des Werts» of an unsichtbares Feld, in the order the select offers them */
const VALUE_TYPES: PropertyType[] = ['boolean', 'number', 'text'];

/**
 * Configures one form-builder field: label/text, key, width, required, category, paragraph style, help and placeholder,
 * «Andere … erlauben» (choice fields), «Gesperrt, wenn per Link vorausgefüllt» (pre-fillable fields), the value type,
 * default and «darf per Link gesetzt werden» of an unsichtbares Feld, «Als eigene Angabe speichern» (on mappings with
 * properties) and the «Nur anzeigen, wenn …» rule. An AHV field (R1) is never pre-fillable and never a property.
 */
@Component({
  selector: 'okr-field-config-form',
  standalone: true,
  imports: [
    ErrorNote, TextInput, NotesInput, StringSelect, Checkbox, VisibilityRuleInput,
    IonGrid, IonRow, IonCol, IonCard, IonCardContent, IonItem, IonNote,
  ],
  styles: [`
    @media (width <= 600px) { ion-card { margin: 5px;} }
    ion-item.hint { --min-height: 0; }
  `],
  template: `
    @if (showForm()) {
      <form novalidate>
        <ion-card>
          <ion-card-content class="ion-no-padding">
            <ion-grid>
              @if (isTextElement()) {
                <ion-row>
                  <ion-col size="12">
                    <okr-notes-input [i18n]="textI18n()" [value]="label()" (valueChange)="onFieldChange('label', $event)"
                      [maxLength]="labelLength()" [readOnly]="isReadOnly()" [errors]="labelErrors()" />
                  </ion-col>
                </ion-row>
              }
              @if (formData().type === 'paragraph') {
                <ion-row>
                  <ion-col size="12" size-md="6">
                    <okr-checkbox [i18n]="isIndentedI18n()" [checked]="isIndented()" (checkedChange)="onFieldChange('isIndented', $event)"
                      [toggle]="true" justify="space-between" labelPlacement="start" [readOnly]="isReadOnly()" />
                  </ion-col>
                  <ion-col size="12" size-md="6">
                    <okr-checkbox [i18n]="isSmallI18n()" [checked]="isSmall()" (checkedChange)="onFieldChange('isSmall', $event)"
                      [toggle]="true" justify="space-between" labelPlacement="start" [readOnly]="isReadOnly()" />
                  </ion-col>
                </ion-row>
              }
              @if (!isDisplay()) {
                <ion-row>
                  <ion-col size="12" size-md="6">
                    <okr-text-input [i18n]="labelI18n()" [value]="label()" (valueChange)="onFieldChange('label', $event)"
                      [autofocus]="true" [maxLength]="labelLength()" [readOnly]="isReadOnly()" />
                    <okr-error-note [errors]="labelErrors()" />
                  </ion-col>
                  <ion-col size="12" size-md="6">
                    <okr-text-input [i18n]="keyI18n()" [value]="key()" (valueChange)="onFieldChange('key', $event)"
                      [maxLength]="nameLength" [showHelper]="true" [readOnly]="isReadOnly()" />
                    <okr-error-note [errors]="keyErrors()" />
                  </ion-col>
                </ion-row>
              }
              @if (isImplicit()) {
                <!-- unsichtbares Feld (spec §8.1): never shown to the filler; its value comes from the page, the link or this default -->
                <ion-row>
                  <ion-col size="12" size-md="6">
                    <okr-string-select [i18n]="valueTypeI18n()" [stringList]="valueTypes" [labels]="valueTypeLabels()"
                      [selectedString]="valueType()" (selectedStringChange)="onValueTypeChange($event)"
                      [showHelper]="false" [readOnly]="isReadOnly()" />
                    <okr-error-note [errors]="valueTypeErrors()" />
                  </ion-col>
                  <ion-col size="12" size-md="6">
                    @if (valueType() === 'boolean') {
                      <okr-checkbox [i18n]="defaultBooleanI18n()" [checked]="defaultValue() === true" (checkedChange)="onDefaultChange($event)"
                        [toggle]="true" justify="space-between" labelPlacement="start" [readOnly]="isReadOnly()" />
                    } @else {
                      <!-- the cap is the one the suite enforces on a text default (LONG_NAME_LENGTH) -->
                      <okr-text-input [i18n]="defaultValueI18n()" [value]="defaultText()" (valueChange)="onDefaultChange($event)"
                        [inputMode]="valueType() === 'number' ? 'decimal' : 'text'" [maxLength]="longNameLength" [readOnly]="isReadOnly()" />
                    }
                    <okr-error-note [errors]="defaultValueErrors()" />
                  </ion-col>
                </ion-row>
                <ion-row>
                  <ion-col size="12">
                    <okr-checkbox [i18n]="fromLinkI18n()" [checked]="fromLink()" (checkedChange)="onFieldChange('fromLink', $event)"
                      [toggle]="true" justify="space-between" labelPlacement="start" [showHelper]="true" [readOnly]="isReadOnly()" />
                  </ion-col>
                </ion-row>
              }
              @if (formData().type === 'category') {
                <ion-row>
                  <ion-col size="12">
                    <okr-string-select [i18n]="categoryI18n()" [stringList]="categoryNames()"
                      [selectedString]="categoryName()" (selectedStringChange)="onFieldChange('categoryName', $event)"
                      [readOnly]="isReadOnly()" />
                    <okr-error-note [errors]="categoryNameErrors()" />
                  </ion-col>
                </ion-row>
              }
              @if (!isImplicit()) {
                <!-- an unsichtbares Feld has no width, is never required, and shows no help or placeholder -->
                <ion-row>
                  <ion-col size="12" size-md="6">
                    <okr-string-select [i18n]="widthI18n()" [stringList]="widths" [labels]="widthLabels()"
                      [selectedString]="width()" (selectedStringChange)="onFieldChange('width', $event)"
                      [readOnly]="isReadOnly()" />
                  </ion-col>
                  @if (!isDisplay()) {
                    <ion-col size="12" size-md="6">
                      <okr-checkbox [i18n]="requiredI18n()" [checked]="required()" (checkedChange)="onFieldChange('required', $event)"
                        [toggle]="true" justify="space-between" labelPlacement="start" [readOnly]="isReadOnly()" />
                    </ion-col>
                  }
                </ion-row>
              }
              @if (!isDisplay() && !isImplicit()) {
                <ion-row>
                  <ion-col size="12" size-md="6">
                    <okr-text-input [i18n]="helpI18n()" [value]="helpText()" (valueChange)="onFieldChange('helpText', $event)"
                      [maxLength]="longNameLength" [readOnly]="isReadOnly()" />
                    <okr-error-note [errors]="helpTextErrors()" />
                  </ion-col>
                  <ion-col size="12" size-md="6">
                    <okr-text-input [i18n]="placeholderI18n()" [value]="placeholder()" (valueChange)="onFieldChange('placeholder', $event)"
                      [maxLength]="nameLength" [readOnly]="isReadOnly()" />
                    <okr-error-note [errors]="placeholderErrors()" />
                  </ion-col>
                </ion-row>
              }
              @if (offersOther() || offersLock()) {
                <ion-row>
                  @if (offersOther()) {
                    <ion-col size="12" size-md="6">
                      <!-- blocked on a typed choice key (gender): «other» is not one of its values; switching off stays possible -->
                      <okr-checkbox [i18n]="allowOtherI18n()" [checked]="allowOther()" (checkedChange)="onFieldChange('allowOther', $event)"
                        [toggle]="true" justify="space-between" labelPlacement="start" [readOnly]="isReadOnly() || (!canOther() && !allowOther())" />
                      <okr-error-note [errors]="allowOtherErrors()" />
                      @if (!canOther()) {
                        <ion-item lines="none" class="hint"><ion-note>{{ i18n().field_allow_other_blocked() }}</ion-note></ion-item>
                      }
                    </ion-col>
                  }
                  @if (offersLock()) {
                    <ion-col size="12" size-md="6">
                      <okr-checkbox [i18n]="lockI18n()" [checked]="lockWhenPrefilled()" (checkedChange)="onFieldChange('lockWhenPrefilled', $event)"
                        [toggle]="true" justify="space-between" labelPlacement="start" [readOnly]="isReadOnly()" />
                    </ion-col>
                  }
                </ion-row>
              }
              @if (propertyType()) {
                <ion-row>
                  <ion-col size="12">
                    <okr-checkbox [i18n]="asPropertyI18n()" [checked]="asProperty()" (checkedChange)="onFieldChange('asProperty', $event)"
                      [toggle]="true" justify="space-between" labelPlacement="start" [showHelper]="true" [readOnly]="isReadOnly()" />
                  </ion-col>
                </ion-row>
              }
            </ion-grid>
          </ion-card-content>
        </ion-card>

        <!-- «Nur anzeigen, wenn …» — collapsed until switched on; an unsichtbares Feld is never shown anyway -->
        @if (!isImplicit()) {
          <ion-card>
            <ion-card-content class="ion-no-padding">
              <okr-visibility-rule-input [rule]="visibleIf()" (ruleChange)="onRuleChange($event)"
                [candidates]="candidates()" [categories]="categories()" [i18n]="i18n()"
                [isBlock]="formData().type === 'divider'" [errors]="ruleErrors()" [readOnly]="isReadOnly()" />
            </ion-card-content>
          </ion-card>
        }
      </form>
    }
  `,
})
export class FieldConfigForm {
  /** kept in step with the caps the Vest suite enforces on these fields */
  protected readonly nameLength = NAME_LENGTH;
  protected readonly longNameLength = LONG_NAME_LENGTH;
  protected readonly widths = FIELD_WIDTHS;
  protected readonly valueTypes = VALUE_TYPES;

  // inputs
  public readonly i18n = input.required<FormI18n>();
  public formData = model.required<Field>();
  /** names of the selectable category lists (`categories` collection), for a 'category' field */
  public readonly categoryNames = input<string[]>([]);
  /** the category lists, for the values of a condition on a category field */
  public readonly categories = input<CategoryListModel[]>([]);
  /** the fields a «Nur anzeigen, wenn …» condition may reference (the earlier input fields) */
  public readonly candidates = input<Field[]>([]);
  /** the form's collection mapping; only one with a `propertiesField` offers «Als eigene Angabe speichern» */
  public readonly mapping = input<FormMapping | undefined>();
  public readonly readOnly = input(false);
  public readonly showForm = input(true);

  // outputs
  public readonly dirty = output<boolean>();
  public readonly valid = output<boolean>();

  // signal form — wraps formData with Vest validation. The suite needs the form's mapping key («Andere …» is
  // refused on a typed choice key such as `gender`), which validateVestTree does not pass: a closure adds it.
  private readonly suiteWithContext = (model: Field) => fieldConfigValidations(model, this.mapping()?.mappingKey);
  protected readonly fieldConfigForm = form(this.formData, (path) =>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    validateVestTree(path, this.suiteWithContext as any),
  );

  // per-field Vest errors for the notes under each field
  private readonly validationResult = vestErrors(this.fieldConfigForm);
  protected labelErrors = computed(() => this.validationResult().getErrors('label'));
  protected keyErrors = computed(() => this.validationResult().getErrors('key'));
  protected categoryNameErrors = computed(() => this.validationResult().getErrors('categoryName'));
  protected helpTextErrors = computed(() => this.validationResult().getErrors('helpText'));
  protected placeholderErrors = computed(() => this.validationResult().getErrors('placeholder'));
  protected allowOtherErrors = computed(() => this.validationResult().getErrors('allowOther'));
  protected valueTypeErrors = computed(() => this.validationResult().getErrors('valueType'));
  protected defaultValueErrors = computed(() => this.validationResult().getErrors('defaultValue'));
  /** the rule's errors, keyed relative to it — the rule editor shows them under each of its controls */
  protected ruleErrors = computed(() => errorsUnder(this.validationResult().getErrors(), 'visibleIf.'));

  constructor() {
    effect(() => this.valid.emit(this.fieldConfigForm().valid()));
  }

  // computed field accessors
  protected readonly isReadOnly = computed(() => coerceBoolean(this.readOnly()));
  protected readonly isDisplay = computed(() => isDisplayField(this.formData().type));
  /** display elements whose static text is entered as prose */
  protected readonly isTextElement = computed(() => this.formData().type === 'label' || this.formData().type === 'paragraph');
  // a paragraph is indented and small unless switched off
  protected readonly isIndented = computed(() => {
    const fd = this.formData();
    return fd.type === 'paragraph' ? fd.isIndented !== false : false;
  });
  protected readonly isSmall = computed(() => {
    const fd = this.formData();
    return fd.type === 'paragraph' ? fd.isSmall !== false : false;
  });
  protected readonly labelLength = computed(() => fieldLabelLength(this.formData()));
  protected readonly label = computed(() => this.formData().label ?? '');
  protected readonly key = computed(() => this.formData().key ?? '');
  protected readonly width = computed(() => this.formData().width ?? 'full');
  protected readonly required = computed(() => this.formData().required === true);
  protected readonly helpText = computed(() => this.formData().helpText ?? '');
  protected readonly placeholder = computed(() => this.formData().placeholder ?? '');
  protected readonly visibleIf = computed(() => this.formData().visibleIf);
  protected readonly asProperty = computed(() => this.formData().asProperty === true);
  /** the property type the answer would be stored as; undefined hides the switch (no properties on this mapping, a type that cannot be one, or an AHV field — R1) */
  protected readonly propertyType = computed(() => {
    const fd = this.formData();
    return this.mapping()?.propertiesField && !isSsnField(fd) ? propertyTypeOf(fd) : undefined;
  });
  protected readonly isImplicit = computed(() => this.formData().type === 'implicit');
  /**
   * «Andere … erlauben» belongs to a closed list of options: dropdown, radio, checkbox with options. A switch that is
   * already on (pasted JSON) is shown anyway, so its error is visible and it can be switched off.
   */
  protected readonly offersOther = computed(() => {
    const fd = this.formData();
    const hasOptions = fd.type === 'dropdown' || fd.type === 'radio' || (fd.type === 'checkbox' && (fd.options?.length ?? 0) > 0);
    return this.allowOther() || (!isSsnField(fd) && hasOptions);
  });
  protected readonly canOther = computed(() => canAllowOther(this.formData(), this.mapping()?.mappingKey));
  protected readonly allowOther = computed(() => (this.formData() as { allowOther?: boolean }).allowOther === true);
  /** a field a link can fill (never an AHV field, R1); an unsichtbares Feld is never shown, so it has nothing to lock */
  protected readonly offersLock = computed(() => !this.isImplicit() && isPrefillable(this.formData()));
  protected readonly lockWhenPrefilled = computed(() => this.formData().lockWhenPrefilled === true);
  // unsichtbares Feld
  protected readonly valueType = computed(() => {
    const fd = this.formData();
    return fd.type === 'implicit' ? fd.valueType ?? '' : '';
  });
  protected readonly defaultValue = computed(() => {
    const fd = this.formData();
    return fd.type === 'implicit' ? fd.defaultValue : undefined;
  });
  /**
   * The key that re-seeds the default input: field id + value type. A memoized `computed`, not an inline source —
   * linkedSignal has no source-equality check, so an inline function reading `formData()` would re-run the
   * computation on every write; the computed only notifies when the key string really changes.
   */
  private readonly defaultTextKey = computed(() => `${this.formData().id}|${this.valueType()}`);
  /**
   * The text in the default input, as the author typed it. Re-seeded from the stored default (read untracked) only
   * when the key changes, so a write to `formData` never rewrites the text under the cursor («0.» stays «0.»).
   */
  protected readonly defaultText = linkedSignal<string, string>({
    source: this.defaultTextKey,
    computation: () => untracked(() => {
      const value = this.defaultValue();
      return value === undefined || value === null ? '' : String(value);
    }),
  });
  protected readonly fromLink = computed(() => {
    const fd = this.formData();
    return fd.type === 'implicit' && fd.fromLink === true;
  });
  protected readonly valueTypeLabels = computed(() => VALUE_TYPES.map(t => propertyTypeLabel(this.i18n(), t)));
  protected readonly categoryName = computed(() => {
    const fd = this.formData();
    return fd.type === 'category' ? fd.categoryName ?? '' : '';
  });

  protected readonly textI18n = computed<NotesInputI18n>(() => ({
    name: 'label', label: this.i18n().field_text(), placeholder: '',
  }));
  protected readonly labelI18n = computed<TextInputI18n>(() => ({
    name: 'label', label: this.i18n().field_label(), placeholder: '', helper: '',
  }));
  protected readonly keyI18n = computed<TextInputI18n>(() => ({
    name: 'key', label: this.i18n().field_key(), placeholder: 'firstName', helper: this.i18n().field_key_helper(),
  }));
  protected readonly categoryI18n = computed<StringSelectI18n>(() => ({
    name: 'categoryName', label: this.i18n().field_category(), helper: this.i18n().field_category_helper(),
  }));
  protected readonly widthI18n = computed<StringSelectI18n>(() => ({
    name: 'width', label: this.i18n().width(),
  }));
  protected readonly widthLabels = computed(() => [
    this.i18n().field_width_full(), this.i18n().field_width_half(), this.i18n().field_width_third(),
  ]);
  protected readonly isIndentedI18n = computed<CheckboxI18n>(() => ({
    name: 'isIndented', label: this.i18n().field_is_indented(), helper: '',
  }));
  protected readonly isSmallI18n = computed<CheckboxI18n>(() => ({
    name: 'isSmall', label: this.i18n().field_is_small(), helper: '',
  }));
  protected readonly requiredI18n = computed<CheckboxI18n>(() => ({
    name: 'required', label: this.i18n().required(), helper: '',
  }));
  protected readonly helpI18n = computed<TextInputI18n>(() => ({
    name: 'helpText', label: this.i18n().help(), placeholder: '', helper: '',
  }));
  protected readonly placeholderI18n = computed<TextInputI18n>(() => ({
    name: 'placeholder', label: this.i18n().field_placeholder(), placeholder: '', helper: '',
  }));

  protected readonly allowOtherI18n = computed<CheckboxI18n>(() => ({
    name: 'allowOther', label: this.i18n().field_allow_other(), helper: '',
  }));
  protected readonly lockI18n = computed<CheckboxI18n>(() => ({
    name: 'lockWhenPrefilled', label: this.i18n().field_lock_prefilled(), helper: '',
  }));
  protected readonly valueTypeI18n = computed<StringSelectI18n>(() => ({
    name: 'valueType', label: this.i18n().field_value_type(),
  }));
  protected readonly defaultValueI18n = computed<TextInputI18n>(() => ({
    name: 'defaultValue', label: this.i18n().field_default_value(), placeholder: '', helper: '',
  }));
  protected readonly defaultBooleanI18n = computed<CheckboxI18n>(() => ({
    name: 'defaultValue', label: this.i18n().field_default_value(), helper: '',
  }));
  protected readonly fromLinkI18n = computed<CheckboxI18n>(() => ({
    name: 'fromLink', label: this.i18n().field_from_link(), helper: this.i18n().field_from_link_helper(),
  }));

  protected readonly asPropertyI18n = computed<CheckboxI18n>(() => {
    const type = this.propertyType();
    return {
      name: 'asProperty', label: this.i18n().field_as_property(),
      helper: type ? fill(this.i18n().field_as_property_helper(), { type: propertyTypeLabel(this.i18n(), type) }) : '',
    };
  });

  /** A rule switched off removes the key — the stored field carries no empty `visibleIf`. */
  protected onRuleChange(rule: VisibilityRule | undefined): void {
    this.dirty.emit(true);
    this.formData.update((vm) => {
      const { visibleIf: _old, ...rest } = vm;
      return (rule ? { ...rest, visibleIf: rule } : rest) as Field;
    });
  }

  protected onFieldChange(fieldName: string, fieldValue: string | boolean): void {
    this.dirty.emit(true);
    this.formData.update((vm) => ({ ...vm, [fieldName]: fieldValue }) as Field);
  }

  /** A new value type drops the default: one of the old type would no longer fit. */
  protected onValueTypeChange(valueType: string): void {
    const fd = this.formData();
    if (fd.type !== 'implicit' || fd.valueType === valueType || !VALUE_TYPES.includes(valueType as PropertyType)) return;
    const { defaultValue: _old, ...rest } = fd;
    this.dirty.emit(true);
    this.formData.set({ ...rest, valueType: valueType as PropertyType });
  }

  /**
   * The default of an unsichtbares Feld: a boolean from the switch, otherwise what `defaultFromText` makes of the
   * typed text (keep / remove / set). The input keeps showing what was typed in every case.
   */
  protected onDefaultChange(value: string | boolean): void {
    const fd = this.formData();
    if (fd.type !== 'implicit') return;
    let next: BaseType | undefined;
    if (typeof value === 'boolean') {
      next = value;
    } else {
      this.defaultText.set(value);
      const change = defaultFromText(fd.valueType, value, fd.defaultValue);
      if (change.action === 'keep') return;
      next = change.action === 'set' ? change.value : undefined;
    }
    if (next === fd.defaultValue) return;
    const { defaultValue: _old, ...rest } = fd;
    this.dirty.emit(true);
    this.formData.set(next === undefined ? rest : { ...rest, defaultValue: next });
  }
}

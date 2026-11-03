import { Component, computed, input, linkedSignal, model, output } from '@angular/core';
import { IonButton, IonCard, IonCardContent, IonCardHeader, IonCardSubtitle, IonCardTitle, IonCol, IonGrid, IonIcon, IonNote, IonRow } from '@ionic/angular';

import { BaseType, FormSectionConfig, ImplicitField } from '@okr/shared-models';
import { Checkbox, CheckboxI18n, ErrorNote, NumberInput, NumberInputI18n, StringSelect, StringSelectI18n, TextInput, TextInputI18n } from '@okr/shared-ui';
import { SvgIconPipe } from '@okr/shared-pipes';
import { coerceBoolean, isSectionOnlyImplicit, isSsnField, parseEmailList } from '@okr/shared-util-core';
import { AcceptanceFields, FormI18n } from '@okr/forms-util';
import { AcceptanceSettingsInput } from '@okr/forms-ui';
import { FORM_EMAILS_MAX_LENGTH, getFieldErrors, getUnrenderedFixedKeys, SectionErrors, SectionI18n } from '@okr/cms-section-util';

/** A form the section can point at, with the implicit fields whose values this page fixes. */
export interface FormOption {
  formKey: string;
  name: string;
  implicitFields: ImplicitField[];
  /** the form-wide «Freie Plätze anzeigen»: what a section without an override of its own shows; absent = off */
  showRemaining?: boolean;
}

/** A course a registration page can be for (D-W4: the stored value is the `CourseModel.okey`). */
export interface CourseOption {
  okey: string;
  name: string;
}

/** The implicit field whose value is the okey of a course: a course select instead of a text field. */
const COURSE_FIELD_KEY = 'courseId';

/** The acceptance overrides a section may carry; absent = «wie im Formular». */
const ACCEPTANCE_KEYS = ['isOpen', 'closesAt', 'maxResponses', 'showRemaining', 'closedMessage'] as const;

/** One «Feste Werte» row: an implicit field of the chosen form, with its input and the value as shown. */
interface FixedRow {
  key: string;
  kind: 'course' | 'text' | 'number' | 'boolean';
  /** the value can come from nowhere else (no default, no link): the suite requires it */
  required: boolean;
  text: string;
  number: number;
  /** option values and labels of the select kinds (course, boolean) */
  list: string[];
  labels: string[];
  textI18n: TextInputI18n;
  numberI18n: NumberInputI18n;
  selectI18n: StringSelectI18n;
  /** a course form but no course to pick yet */
  noCourses: boolean;
}

/**
 * Settings of a form section (spec 1.125 B): which form the page shows, who is told about answers, the fixed
 * values of the form's implicit fields («Feste Werte») and the page's own acceptance rules («Annahme»).
 * A sub-form, not a modal: `SectionForm` owns the model and the suite and hands the errors back in.
 */
@Component({
  selector: 'okr-form-section-config',
  standalone: true,
  imports: [
    TextInput, NumberInput, Checkbox, StringSelect, ErrorNote, AcceptanceSettingsInput, SvgIconPipe,
    IonCard, IonCardHeader, IonCardTitle, IonCardSubtitle, IonCardContent, IonGrid, IonRow, IonCol, IonNote, IonButton, IonIcon,
  ],
  styles: [`@media (width <= 600px) { ion-card { margin: 5px;} }`],
  template: `
    <ion-card>
      <ion-card-header>
        <ion-card-title>{{ i18n().form_cfg_title() }}</ion-card-title>
        <ion-card-subtitle>{{ i18n().form_cfg_subtitle() }}</ion-card-subtitle>
      </ion-card-header>
      <ion-card-content class="ion-no-padding">
        <ion-grid>
          <ion-row>
            <ion-col size="12" size-md="6">
              <okr-string-select [i18n]="formI18nSelect()" [selectedString]="formKey()" (selectedStringChange)="onFormChange($event)"
                [stringList]="formKeys()" [labels]="formLabels()" [readOnly]="isReadOnly()" />
              <okr-error-note [errors]="errorsFor('formKey')" />
            </ion-col>
            <ion-col size="12" size-md="6">
              <ion-button fill="outline" [disabled]="isReadOnly()" (click)="responsibilitySelectClicked.emit()">
                <ion-icon slot="start" src="{{ 'search' | svgIcon }}" />
                {{ responsibilityKey() || i18n().form_cfg_resp_select() }}
              </ion-button>
              @if (responsibilityKey()) {
                <ion-button fill="clear" [disabled]="isReadOnly()" (click)="onResponsibilityClear()">
                  {{ i18n().form_cfg_resp_clear() }}
                </ion-button>
              }
              <ion-note class="ion-padding-start">{{ i18n().form_cfg_resp_helper() }}</ion-note>
            </ion-col>
            <ion-col size="12">
              <okr-text-input [i18n]="emailsI18n()" [value]="emailsText()" (valueChange)="onEmailsChange($event)"
                [maxLength]="emailsLength" [showHelper]="true" [readOnly]="isReadOnly()" />
              <okr-error-note [errors]="errorsFor('emailAddresses')" />
            </ion-col>
            <ion-col size="12" size-md="6">
              <okr-checkbox [i18n]="captchaI18n()" [checked]="showCaptcha()" (checkedChange)="onFieldChange('showCaptcha', $event)"
                [showHelper]="true" [readOnly]="isReadOnly()" />
            </ion-col>
            <ion-col size="12" size-md="6">
              <okr-checkbox [i18n]="encryptI18n()" [checked]="encryptFileUpload()" (checkedChange)="onFieldChange('encryptFileUpload', $event)"
                [showHelper]="true" [readOnly]="isReadOnly()" />
            </ion-col>
          </ion-row>
        </ion-grid>
      </ion-card-content>
    </ion-card>

    <!-- «Feste Werte»: what this page fixes for the form's implicit fields, e.g. the course -->
    <ion-card>
      <ion-card-header>
        <ion-card-title>{{ i18n().form_cfg_fixed_title() }}</ion-card-title>
        <ion-card-subtitle>{{ i18n().form_cfg_fixed_subtitle() }}</ion-card-subtitle>
      </ion-card-header>
      <ion-card-content class="ion-no-padding">
        <ion-grid>
          <ion-row>
            @if (!chosenForm()) {
              <ion-col size="12"><ion-note>{{ i18n().form_cfg_fixed_pick_form() }}</ion-note></ion-col>
            } @else if (rows().length === 0) {
              <ion-col size="12"><ion-note>{{ i18n().form_cfg_fixed_none() }}</ion-note></ion-col>
            }
            @for (key of strayKeys(); track key) {
              <!-- an entry no row shows (an AHV key from pasted or legacy data): its error, and a way to remove it -->
              <ion-col size="12">
                <okr-error-note [errors]="errorsFor('implicitValues.' + key)" />
                <ion-button fill="clear" [disabled]="isReadOnly()" (click)="onStrayRemove(key)">{{ i18n().form_cfg_fixed_remove() }}</ion-button>
              </ion-col>
            }
            @for (row of rows(); track row.key) {
              <ion-col size="12" size-md="6">
                @switch (row.kind) {
                  @case ('course') {
                    <okr-string-select [i18n]="row.selectI18n" [selectedString]="row.text" (selectedStringChange)="onFixedChange(row.key, $event)"
                      [stringList]="row.list" [labels]="row.labels" [readOnly]="isReadOnly()" />
                    @if (row.noCourses) {
                      <ion-note class="ion-padding-start">{{ i18n().form_cfg_fixed_course_none() }}</ion-note>
                    }
                  }
                  @case ('boolean') {
                    <okr-string-select [i18n]="row.selectI18n" [selectedString]="row.text" (selectedStringChange)="onFixedBoolean(row.key, $event)"
                      [stringList]="row.list" [labels]="row.labels" [readOnly]="isReadOnly()" />
                  }
                  @case ('number') {
                    <okr-number-input [i18n]="row.numberI18n" [value]="row.number" (valueChange)="onFixedNumber(row.key, $event)"
                      [showHelper]="true" [readOnly]="isReadOnly()" />
                  }
                  @default {
                    <okr-text-input [i18n]="row.textI18n" [value]="row.text" (valueChange)="onFixedChange(row.key, $event)"
                      [showHelper]="true" [readOnly]="isReadOnly()" />
                  }
                }
                <okr-error-note [errors]="errorsFor('implicitValues.' + row.key)" />
              </ion-col>
            }
          </ion-row>
        </ion-grid>
      </ion-card-content>
    </ion-card>

    <!-- «Annahme»: this page's own places, deadline and closed text; what stays empty is the form's -->
    <ion-card>
      <ion-card-header>
        <ion-card-title>{{ i18n().form_cfg_accept_title() }}</ion-card-title>
        <ion-card-subtitle>{{ i18n().form_cfg_accept_subtitle() }}</ion-card-subtitle>
      </ion-card-header>
      <ion-card-content class="ion-no-padding">
        <okr-acceptance-settings-input [settings]="acceptance()" (settingsChange)="onAcceptanceChange($event)" [inherit]="true"
          [inheritedShowRemaining]="formShowRemaining()"
          [i18n]="formI18n()" [errors]="errors()" [readOnly]="isReadOnly()" />
      </ion-card-content>
    </ion-card>
  `,
})
export class FormSectionConfiguration {
  /** kept in step with the cap the Vest suite enforces on the list */
  protected readonly emailsLength = FORM_EMAILS_MAX_LENGTH;

  // inputs
  public readonly formData = model.required<FormSectionConfig>();
  /** the non-archived forms of the tenant, with their implicit fields */
  public readonly forms = input<FormOption[]>([]);
  /** the non-archived courses of the tenant, by name */
  public readonly courses = input<CourseOption[]>([]);
  public readonly readOnly = input(true);
  public readonly i18n = input.required<SectionI18n>();
  /** the forms keys, for the «Annahme» card (`AcceptanceSettingsInput`) */
  public readonly formI18n = input.required<FormI18n>();
  /** vest field name -> messages of the running section suite (see section.form.ts) */
  public readonly errors = input<SectionErrors>({});

  // outputs
  /** the parent opens the responsibility picker and writes `responsibilityKey` back */
  public readonly responsibilitySelectClicked = output<void>();

  protected readonly isReadOnly = computed(() => coerceBoolean(this.readOnly()));

  // fields — legacy sections lack the phase B ones (reads skip model defaults): coalesce
  protected readonly formKey = computed(() => this.formData().formKey ?? '');
  protected readonly responsibilityKey = computed(() => this.formData().responsibilityKey ?? '');
  protected readonly showCaptcha = computed(() => this.formData().showCaptcha === true);
  protected readonly encryptFileUpload = computed(() => this.formData().encryptFileUpload === true);

  /**
   * The addresses as typed. Rebuilt from the model only when the model no longer matches the text: a
   * typed «a@b.ch,» parses to one address, and re-joining it would swallow the comma the user is typing.
   */
  protected readonly emailsText = linkedSignal<string[] | undefined, string>({
    source: () => this.formData().emailAddresses,
    computation: (list, previous) => {
      const addresses = list ?? [];
      const typed = previous?.value ?? '';
      return sameList(parseEmailList(typed), addresses) ? typed : addresses.join(', ');
    },
  });

  // the chosen form and the select of forms
  protected readonly chosenForm = computed(() => this.forms().find((f) => f.formKey === this.formKey()));
  /** '' = nothing chosen; a form that is gone (archived) stays selectable by its key so the select does not go blank */
  protected readonly formKeys = computed(() => {
    const keys = this.forms().map((f) => f.formKey);
    return ['', ...(this.formKey() !== '' && !keys.includes(this.formKey()) ? [this.formKey()] : []), ...keys];
  });
  protected readonly formLabels = computed(() => {
    const names = this.forms().map((f) => f.name);
    return [this.i18n().form_cfg_form_none(), ...(this.formKey() !== '' && !this.chosenForm() ? [this.formKey()] : []), ...names];
  });

  /** «Feste Werte»: one row per implicit field of the chosen form — never an AHV field (R1) */
  protected readonly rows = computed<FixedRow[]>(() => {
    const values = this.formData().implicitValues ?? {};
    const courses = this.courses();
    return (this.chosenForm()?.implicitFields ?? [])
      .filter((field) => !isSsnField(field))
      .map((field) => {
        const raw = values[field.key];
        const required = isSectionOnlyImplicit(field);
        const kind: FixedRow['kind'] = field.key === COURSE_FIELD_KEY && field.valueType === 'text' ? 'course'
          : field.valueType === 'number' ? 'number' : field.valueType === 'boolean' ? 'boolean' : 'text';
        const helper = required ? this.i18n().form_cfg_fixed_required() : '';
        const label = field.label || field.key;
        // select lists: a course value whose course is gone stays selectable by its okey
        const courseKeys = courses.map((c) => c.okey);
        const course = kind === 'course'
          ? {
            list: ['', ...(typeof raw === 'string' && raw !== '' && !courseKeys.includes(raw) ? [raw] : []), ...courseKeys],
            labels: [this.i18n().form_cfg_fixed_course_pick(), ...(typeof raw === 'string' && raw !== '' && !courseKeys.includes(raw) ? [raw] : []), ...courses.map((c) => c.name)],
          }
          : { list: ['', 'true', 'false'], labels: ['–', this.i18n().form_cfg_fixed_yes(), this.i18n().form_cfg_fixed_no()] };
        return {
          key: field.key,
          kind,
          required,
          text: kind === 'boolean' ? (typeof raw === 'boolean' ? String(raw) : '') : (raw === undefined || raw === null ? '' : String(raw)),
          number: (typeof raw === 'number' ? raw : undefined) as unknown as number,
          list: course.list,
          labels: course.labels,
          textI18n: { name: field.key, label, placeholder: '', helper },
          numberI18n: { name: field.key, label, placeholder: '', helper },
          selectI18n: { name: field.key, label, helper },
          noCourses: kind === 'course' && courses.length === 0,
        };
      });
  });

  /** `implicitValues.<key>` errors of entries no row shows */
  protected readonly strayKeys = computed(() => getUnrenderedFixedKeys(this.errors(), this.rows().map((r) => r.key)));

  /** the chosen form's «Freie Plätze anzeigen»: what this page shows until it sets its own */
  protected readonly formShowRemaining = computed(() => this.chosenForm()?.showRemaining === true);

  /** only the overrides this page really carries — an absent one is not shown as a value of its own */
  protected readonly acceptance = computed<Partial<AcceptanceFields>>(() => {
    const fd = this.formData();
    const shown: Partial<AcceptanceFields> = {};
    for (const key of ACCEPTANCE_KEYS) {
      if (fd[key] !== undefined) (shown as Record<string, unknown>)[key] = fd[key];
    }
    return shown;
  });

  // i18n for the shared/ui primitives
  protected readonly formI18nSelect = computed<StringSelectI18n>(() => ({
    name: 'formKey', label: this.i18n().form_cfg_form(), helper: this.i18n().form_cfg_form_helper(),
  }));
  protected readonly emailsI18n = computed<TextInputI18n>(() => ({
    name: 'emailAddresses', label: this.i18n().form_cfg_emails(), placeholder: this.i18n().form_cfg_emails_ph(), helper: this.i18n().form_cfg_emails_helper(),
  }));
  protected readonly captchaI18n = computed<CheckboxI18n>(() => ({
    name: 'showCaptcha', label: this.i18n().form_cfg_captcha(), helper: this.i18n().form_cfg_captcha_helper(),
  }));
  protected readonly encryptI18n = computed<CheckboxI18n>(() => ({
    name: 'encryptFileUpload', label: this.i18n().form_cfg_encrypt(), helper: this.i18n().form_cfg_encrypt_helper(),
  }));
  protected errorsFor(field: string): string[] {
    return getFieldErrors(this.errors(), field);
  }

  /** The fixed values belong to the old form's fields: a new form starts without them. */
  protected onFormChange(formKey: string): void {
    if (formKey === this.formKey()) return;   // echo
    this.formData.update((vm) => ({ ...vm, formKey, implicitValues: {} }));
  }

  protected onFieldChange(name: 'showCaptcha' | 'encryptFileUpload', value: boolean): void {
    if (this[name]() === value) return;
    this.formData.update((vm) => ({ ...vm, [name]: value }));
  }

  protected onEmailsChange(text: string): void {
    if (text === this.emailsText()) return;   // echo
    this.emailsText.set(text);
    const emailAddresses = parseEmailList(text);
    this.formData.update((vm) => ({ ...vm, emailAddresses }));
  }

  protected onResponsibilityClear(): void {
    this.formData.update((vm) => {
      const next = { ...vm };
      delete next.responsibilityKey;
      return next;
    });
  }

  protected onStrayRemove(key: string): void {
    this.setFixed(key, undefined);
  }

  /** A value (text, course okey); empty removes the entry, so «not set» never reads as an empty answer. */
  protected onFixedChange(key: string, value: string): void {
    this.setFixed(key, value === '' ? undefined : value);
  }

  protected onFixedNumber(key: string, value: number | null | undefined): void {
    this.setFixed(key, typeof value === 'number' && Number.isFinite(value) ? value : undefined);
  }

  protected onFixedBoolean(key: string, value: string): void {
    this.setFixed(key, value === 'true' ? true : value === 'false' ? false : undefined);
  }

  private setFixed(key: string, value: BaseType | undefined): void {
    const current = this.formData().implicitValues ?? {};
    if (current[key] === value || (value === undefined && !(key in current))) return;   // echo
    const next = { ...current };
    if (value === undefined) delete next[key];
    else next[key] = value;
    this.formData.update((vm) => ({ ...vm, implicitValues: next }));
  }

  /**
   * Writes only what the author set. An empty date or text, a limit of 0 and «open» are the same as no
   * override (inherit): the key is removed instead of storing the form's values or defaults in the section.
   * «Freie Plätze anzeigen» is the same as no override when it equals the form's value, whichever way that points.
   */
  protected onAcceptanceChange(settings: Partial<AcceptanceFields>): void {
    this.formData.update((vm) => {
      const next: Record<string, unknown> = { ...vm };
      for (const key of ACCEPTANCE_KEYS) {
        const value = settings[key];
        const inherit = value === undefined || value === null || value === '' || (key === 'maxResponses' && value === 0) || (key === 'isOpen' && value === true) || (key === 'showRemaining' && value === this.formShowRemaining());
        if (inherit) delete next[key];
        else next[key] = value;
      }
      return next as unknown as FormSectionConfig;
    });
  }
}

function sameList(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

import { Component, computed, DestroyRef, effect, inject, input, OnInit, output, signal, untracked } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { AbstractControl, FormControl, FormGroup, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { IonButton } from '@ionic/angular';
import { BaseType, CategoryListModel, DerivedValue, Field, FormDefinitionModel, OTHER_OPTION_VALUE } from '@okr/shared-models';
import { FORM_OTHER_TEXT_MAX, ModelSelectChoice, PublicCourseOption, choiceByName, computeDerivedValues, coursesForAudience, getTodayStr, isModelSelect, modelSelectKeyOf, shouldClearCourseChoice, getVisibleFieldIds, resolveFixedValues, resolveImplicitValues } from '@okr/shared-util-core';
import { validatorsFor, defaultFor, isInputField } from '@okr/forms-util';
import { DEFAULT_FIELD_COURSE_I18N, DEFAULT_FIELD_OTHER_I18N, DEFAULT_FIELD_PICK_I18N, FieldCourseI18n, FieldOtherI18n, FieldPickI18n, FieldRenderer } from './field-renderer';

/** The key of the «Andere» text of a field (spec §9). */
function otherKeyOf(field: Field): string {
  return field.key + 'Other';
}

/** Required, and blank (spaces only) counts as empty — the server drops a blank «Andere» text. */
function requiredText(control: AbstractControl): ValidationErrors | null {
  return typeof control.value === 'string' && control.value.trim() !== '' ? null : { required: true };
}

/** «Andere …» picked: the reserved value, or a list holding it (checkbox group). */
function isOtherValue(value: unknown): boolean {
  return Array.isArray(value) ? value.includes(OTHER_OPTION_VALUE) : value === OTHER_OPTION_VALUE;
}

@Component({
  selector: 'okr-form-renderer',
  standalone: true,
  imports: [ReactiveFormsModule, IonButton, FieldRenderer],
  styles: [`
    .hp-field { position: absolute; left: -9999px; aria-hidden: true; }
    /* consecutive half/third fields share a line; a field that does not fit wraps to the next */
    .fields { display: flex; flex-wrap: wrap; align-items: flex-start; }
    .fields > okr-field-renderer { flex: 0 0 100%; min-width: 0; }
    .fields > okr-field-renderer.width-half  { flex-basis: 50%; }
    .fields > okr-field-renderer.width-third { flex-basis: 33.333%; }
    @media (width <= 576px) {
      .fields > okr-field-renderer.width-half,
      .fields > okr-field-renderer.width-third { flex-basis: 100%; }
    }
  `],
  template: `
    <form [formGroup]="form()" (ngSubmit)="onSubmit()">

      <!-- §10.1 HTML honeypot — must stay invisible to real users -->
      <div class="hp-field" aria-hidden="true">
        <label [for]="honeypotKey()">Leave this field empty</label>
        <input
          type="text"
          [name]="honeypotKey()"
          [id]="honeypotKey()"
          [formControlName]="honeypotKey()"
          tabindex="-1"
          autocomplete="off"
        />
      </div>

      <!-- §10.3 JS token — populated by parent after fetch -->
      <input type="hidden" name="_jsToken" [formControlName]="'_jsToken'" />

      <div class="fields">
        @for (field of sortedFields(); track field.id) {
          <!-- an implicit field, and one the page fixed, only hold a control: never mounted, so no label, help text or error note -->
          @if (field.type !== 'implicit' && !isFixed(field) && visibleIds().has(field.id)) {
            <okr-field-renderer [class]="'width-' + field.width" [field]="field" [control]="getControl(field)"
              [category]="categoryOf(field)" [readOnly]="isLocked(field)" [otherControl]="otherControlOf(field)"
              [otherI18n]="otherI18n()"
              [choices]="choicesOf(field)" [keyControl]="keyControlOf(field)" [pickI18n]="pickI18n()"
              [courses]="courseList()" [audienceKnown]="courseAudienceValue() !== undefined" [courseI18n]="courseI18n()" />
          }
        }
      </div>
      @if (showSubmit()) {
        <ion-button
          type="submit"
          expand="block"
          [disabled]="form().invalid || submitting()"
          style="margin: 16px;"
        >
          {{ submitLabel() }}
        </ion-button>
      }
    </form>
  `,
})
export class FormRenderer implements OnInit {
  public readonly definition = input.required<FormDefinitionModel>();
  public readonly submitLabel = input('Absenden');
  public readonly showSubmit = input(true);
  public readonly submitting = input(false);
  public readonly jsToken = input('');
  /** the tenant's category lists — a 'category' field looks its list up here by name */
  public readonly categories = input<CategoryListModel[]>([]);
  /** answers from the page link (`parsePrefillParams`), over the defaults; read once, when the controls are built */
  public readonly prefill = input<Record<string, unknown>>({});
  /** the pre-filled keys; a field with `lockWhenPrefilled` among them is shown read-only (spec §8) */
  public readonly lockedKeys = input<string[]>([]);
  /** the values of the implicit fields (`resolveImplicitValues`); a missing key falls back to the field's default */
  public readonly implicitValues = input<Record<string, BaseType>>({});
  /** the «Andere …» labels */
  public readonly otherI18n = input<FieldOtherI18n>(DEFAULT_FIELD_OTHER_I18N);
  /** the derived value that says who the applicant is (`PublicFormDefinition.courseAudience`); a 'course' field takes its audience from it */
  public readonly courseAudience = input<DerivedValue | undefined>();
  /** the announced courses (`PublicFormDefinition.courses`); the renderer shows those that suit the audience */
  public readonly courses = input<PublicCourseOption[]>([]);
  /** the texts of the course choice */
  public readonly courseI18n = input<FieldCourseI18n>(DEFAULT_FIELD_COURSE_I18N);
  /** the page's parameter: fixed answers by field key (`PublicFormDefinition.fixedValues`); those fields are not shown */
  public readonly fixedValues = input<Record<string, string>>({});
  /** the lists of the person / org / resource pickers, by field key */
  public readonly choices = input<Record<string, ModelSelectChoice[]>>({});
  public readonly pickI18n = input<FieldPickI18n>(DEFAULT_FIELD_PICK_I18N);
  public readonly submitted = output<Record<string, unknown>>();
  /** every answer, hidden ones included (`getRawValue()`), after each change — for the builder preview */
  public readonly valueChange = output<Record<string, unknown>>();

  protected readonly sortedFields = computed(() =>
    [...this.definition().fields].sort((a, b) => a.order - b.order)
  );

  protected readonly honeypotKey = computed(() =>
    this.definition().honeypotKey || 'website'
  );

  private readonly destroyRef = inject(DestroyRef);

  /** every answer, hidden ones included, as a signal — what the derived applicant type is computed from */
  private readonly answers = signal<Record<string, unknown>>({});

  private readonly courseField = computed(() => this.definition().fields.find(f => f.type === 'course'));

  /** the applicant type the server will derive (the same `computeDerivedValues`); undefined until it is known */
  protected readonly courseAudienceValue = computed<string | undefined>(() => {
    const field = this.courseField();
    const derived = this.courseAudience();
    if (field?.type !== 'course' || !derived) return undefined;
    const value = computeDerivedValues([derived], this.definition().fields, this.answers(), this.visibleIds() as Set<string>, getTodayStr())[field.audienceFrom];
    return value ? value : undefined;
  });

  /** the courses that suit the applicant type, sorted by start date */
  protected readonly courseList = computed(() => coursesForAudience(this.courses(), this.courseAudienceValue()));

  private _form: FormGroup = new FormGroup({});

  protected form = computed(() => this._form);

  /** ids of the fields (and dividers) a visibility rule currently shows; recomputed on every answer */
  protected readonly visibleIds = signal<ReadonlySet<string>>(new Set());

  /** the value a field starts with (link, implicit or default) — and gets back when a rule shows it again */
  private initialValues: Record<string, unknown> = {};
  /** keys shown read-only: pre-filled by the link AND flagged `lockWhenPrefilled` */
  private lockedKeySet: ReadonlySet<string> = new Set();
  /** the `<key>Other` controls, by the owning field's key */
  private otherControls: Record<string, FormControl> = {};
  /** the `<key>Key` controls of the pickers (the okey of the picked record), by the owning field's key */
  private keyControls: Record<string, FormControl> = {};
  /** keys the page fixed (`fixedValues`): held, never shown — read once, when the controls are built */
  private fixedKeySet: ReadonlySet<string> = new Set();

  public constructor() {
    // Hidden means absent: a hidden input is emptied and disabled, so it drops out of form.value
    // and form.invalid. All writes use emitEvent:false, so this cannot feed back into valueChanges.
    effect(() => {
      const visible = this.visibleIds();
      const fields = this.definition().fields;
      untracked(() => {
        let restored = false;
        for (const field of fields) {
          if (!isInputField(field)) continue;
          const control = this._form.get(field.key);
          if (!control) continue;
          if (visible.has(field.id)) {
            if (control.disabled) {
              // a shown field starts from its initial value again: the link's, the implicit one, or the default
              const initial = this.initialValues[field.key] ?? defaultFor(field);
              control.setValue(Array.isArray(initial) ? [...initial] : initial, { emitEvent: false });
              control.enable({ emitEvent: false });
              restored = true;
            }
          } else if (control.enabled) {
            control.reset(defaultFor(field), { emitEvent: false });
            control.disable({ emitEvent: false });
          }
        }
        this.syncOtherControls();
        this.syncKeyControls();
        // a restored value may itself show or hide a later field (converges: set only on change)
        if (restored) this.updateVisibility();
      });
    });
  }

  /** a picker's list may arrive after the controls were built: check its answer against it again */
  private readonly revalidatePickers = effect(() => {
    this.choices();
    untracked(() => {
      for (const field of this.definition().fields) {
        if (isModelSelect(field)) this._form.get(field.key)?.updateValueAndValidity({ emitEvent: false });
      }
    });
  });

  /** a ticked course that left the list (the applicant type changed, or it filled up) is unticked */
  private readonly clearCourse = effect(() => {
    const list = this.courseList();
    const field = this.courseField();
    if (!field) return;
    untracked(() => {
      const control = this._form.get(field.key);
      const value = control?.value;
      if (control && typeof value === 'string' && shouldClearCourseChoice(value, list)) control.setValue('');
    });
  });

  public ngOnInit(): void {
    const fields = this.definition().fields;
    const prefill = this.prefill();
    const prefilled = new Set(this.lockedKeys());
    // the section's / link's values over the fields' own defaults (an AHV field never resolves — R1)
    const implicit = { ...resolveImplicitValues(fields, undefined, {}), ...this.implicitValues() };
    const inputKeys = new Set(fields.filter(f => isInputField(f)).map(f => f.key));
    // the page's fixed answers win over the link's: the topic of a contact form on «Junioren» is 'junior'
    const fixed = resolveFixedValues(fields, this.fixedValues());
    const controls: Record<string, FormControl> = {};
    const locked = new Set<string>();
    this.initialValues = {};
    this.otherControls = {};
    this.keyControls = {};
    this.fixedKeySet = new Set(Object.keys(fixed));
    for (const field of fields) {
      // Display-only elements (label, divider) hold no value — no control, not submitted.
      if (!isInputField(field)) continue;
      if (field.type === 'implicit') {
        // never rendered, never required: a plain holder of the resolved value
        const value = Object.prototype.hasOwnProperty.call(implicit, field.key) ? implicit[field.key] : defaultFor(field);
        this.initialValues[field.key] = value;
        controls[field.key] = new FormControl(value);
        continue;
      }
      const value = Object.prototype.hasOwnProperty.call(fixed, field.key) ? fixed[field.key]
        : Object.prototype.hasOwnProperty.call(prefill, field.key) ? prefill[field.key] : defaultFor(field);
      this.initialValues[field.key] = value;
      if (field.lockWhenPrefilled === true && prefilled.has(field.key) && Object.prototype.hasOwnProperty.call(prefill, field.key)) {
        locked.add(field.key);
      }
      controls[field.key] = new FormControl(value, [...validatorsFor(field), ...this.pickerValidators(field)]);
      // a picker: the okey of the picked record travels as `<key>Key`; never over a real field's key
      if (isModelSelect(field) && !inputKeys.has(modelSelectKeyOf(field))) {
        const keyControl = new FormControl('');
        this.keyControls[field.key] = keyControl;
        controls[modelSelectKeyOf(field)] = keyControl;
      }
      // «Andere …»: its text control, enabled only while «Andere» is picked; never over a real field's key
      if (this.allowsOther(field) && !inputKeys.has(otherKeyOf(field))) {
        const other = new FormControl('', [requiredText, Validators.maxLength(FORM_OTHER_TEXT_MAX)]);
        other.disable({ emitEvent: false });
        this.otherControls[field.key] = other;
        controls[otherKeyOf(field)] = other;
      }
    }
    this.lockedKeySet = locked;
    // Honeypot — always empty, no validators
    controls[this.honeypotKey()] = new FormControl('');
    // JS token — populated reactively by effect in parent
    controls['_jsToken'] = new FormControl(this.jsToken());
    this._form = new FormGroup(controls);

    this.updateVisibility();
    this.syncOtherControls();
    this.syncKeyControls();
    this.answers.set(this._form.getRawValue() as Record<string, unknown>);
    this._form.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      this.updateVisibility();
      this.syncOtherControls();
      this.syncKeyControls();
      this.answers.set(this._form.getRawValue() as Record<string, unknown>);
      this.valueChange.emit(this._form.getRawValue() as Record<string, unknown>);
    });
  }

  private allowsOther(field: Field): boolean {
    return (field.type === 'dropdown' || field.type === 'radio' || field.type === 'checkbox')
      && field.allowOther === true && (field.options?.length ?? 0) > 0;
  }

  /**
   * An «Andere» text counts only while its field is shown and «Andere» is picked: then it is enabled
   * (and required); otherwise it is emptied and disabled, so it drops out of form.value and
   * form.invalid — the same «hidden means absent» as a hidden field. emitEvent:false, no feedback.
   */
  private syncOtherControls(): void {
    for (const field of this.definition().fields) {
      const other = this.otherControls[field.key];
      if (!other) continue;
      const owner = this._form.get(field.key);
      const active = !!owner && owner.enabled && isOtherValue(owner.value);
      if (active) {
        if (other.disabled) other.enable({ emitEvent: false });
      } else if (other.enabled) {
        other.reset('', { emitEvent: false });
        other.disable({ emitEvent: false });
      }
    }
  }

  /** A picker's `<key>Key` counts only while its field is shown: otherwise emptied and disabled (hidden means absent). */
  private syncKeyControls(): void {
    for (const [key, keyControl] of Object.entries(this.keyControls)) {
      const owner = this._form.get(key);
      if (owner?.enabled) {
        if (keyControl.disabled) keyControl.enable({ emitEvent: false });
      } else if (keyControl.enabled) {
        keyControl.reset('', { emitEvent: false });
        keyControl.disable({ emitEvent: false });
      }
    }
  }

  /**
   * A picker without free text takes only a listed name (the server checks the same). The list is read when the
   * control validates, so a list that arrives later counts; without a list any name is taken (an anonymous person).
   */
  private pickerValidators(field: Field): ((control: AbstractControl) => ValidationErrors | null)[] {
    if (!isModelSelect(field) || field.allowCustom === true) return [];
    return [(control: AbstractControl) => {
      const list = this.choices()[field.key] ?? [];
      const value = control.value;
      if (list.length === 0 || typeof value !== 'string' || value.trim() === '') return null;
      return choiceByName(list, value) ? null : { invalidChoice: true };
    }];
  }

  private updateVisibility(): void {
    // getRawValue(): disabled (hidden) controls still contribute their reset value
    const next = getVisibleFieldIds(
      this.definition().fields,
      this._form.getRawValue() as Record<string, unknown>,
      getTodayStr()
    );
    const current = this.visibleIds();
    if (next.size === current.size && [...next].every(id => current.has(id))) return;
    this.visibleIds.set(next);
  }

  public updateJsToken(token: string): void {
    this._form.get('_jsToken')?.setValue(token, { emitEvent: false });
  }

  protected categoryOf(field: Field): CategoryListModel | undefined {
    return field.type === 'category' ? this.categories().find(c => c.name === field.categoryName) : undefined;
  }

  protected isFixed(field: Field): boolean {
    return this.fixedKeySet.has(field.key);
  }

  protected choicesOf(field: Field): ModelSelectChoice[] {
    return isModelSelect(field) ? this.choices()[field.key] ?? [] : [];
  }

  protected keyControlOf(field: Field): FormControl | undefined {
    return this.keyControls[field.key];
  }

  protected isLocked(field: Field): boolean {
    return this.lockedKeySet.has(field.key);
  }

  protected otherControlOf(field: Field): FormControl | undefined {
    return this.otherControls[field.key];
  }

  protected getControl(field: Field): FormControl {
    return (this._form.get(field.key) as FormControl) ?? new FormControl('');
  }

  protected onSubmit(): void {
    if (this._form.invalid) {
      this._form.markAllAsTouched();
      return;
    }
    this.submitted.emit(this._form.value as Record<string, unknown>);
  }
}

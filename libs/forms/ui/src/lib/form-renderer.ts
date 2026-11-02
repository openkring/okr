import { Component, computed, DestroyRef, effect, inject, input, OnInit, output, signal, untracked } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { AbstractControl, FormControl, FormGroup, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { IonButton } from '@ionic/angular';
import { BaseType, CategoryListModel, Field, FormDefinitionModel, OTHER_OPTION_VALUE } from '@okr/shared-models';
import { FORM_OTHER_TEXT_MAX, getTodayStr, getVisibleFieldIds, resolveImplicitValues } from '@okr/shared-util-core';
import { validatorsFor, defaultFor, isInputField } from '@okr/forms-util';
import { DEFAULT_FIELD_OTHER_I18N, FieldOtherI18n, FieldRenderer } from './field-renderer';

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
          <!-- an implicit field only holds a control: never mounted, so no label, help text or error note -->
          @if (field.type !== 'implicit' && visibleIds().has(field.id)) {
            <okr-field-renderer [class]="'width-' + field.width" [field]="field" [control]="getControl(field)"
              [category]="categoryOf(field)" [readOnly]="isLocked(field)" [otherControl]="otherControlOf(field)"
              [otherI18n]="otherI18n()" />
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
        // a restored value may itself show or hide a later field (converges: set only on change)
        if (restored) this.updateVisibility();
      });
    });
  }

  public ngOnInit(): void {
    const fields = this.definition().fields;
    const prefill = this.prefill();
    const prefilled = new Set(this.lockedKeys());
    // the section's / link's values over the fields' own defaults (an AHV field never resolves — R1)
    const implicit = { ...resolveImplicitValues(fields, undefined, {}), ...this.implicitValues() };
    const inputKeys = new Set(fields.filter(f => isInputField(f)).map(f => f.key));
    const controls: Record<string, FormControl> = {};
    const locked = new Set<string>();
    this.initialValues = {};
    this.otherControls = {};
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
      const value = Object.prototype.hasOwnProperty.call(prefill, field.key) ? prefill[field.key] : defaultFor(field);
      this.initialValues[field.key] = value;
      if (field.lockWhenPrefilled === true && prefilled.has(field.key) && Object.prototype.hasOwnProperty.call(prefill, field.key)) {
        locked.add(field.key);
      }
      controls[field.key] = new FormControl(value, validatorsFor(field));
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
    this._form.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      this.updateVisibility();
      this.syncOtherControls();
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

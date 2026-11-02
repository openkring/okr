import { Component, computed, DestroyRef, effect, inject, input, OnInit, output, signal, untracked } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { IonButton } from '@ionic/angular';
import { CategoryListModel, Field, FormDefinitionModel } from '@okr/shared-models';
import { getTodayStr, getVisibleFieldIds } from '@okr/shared-util-core';
import { validatorsFor, defaultFor, isInputField } from '@okr/forms-util';
import { FieldRenderer } from './field-renderer';

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
          @if (visibleIds().has(field.id)) {
            <okr-field-renderer [class]="'width-' + field.width" [field]="field" [control]="getControl(field)"
              [category]="categoryOf(field)" />
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
  public readonly submitted = output<Record<string, unknown>>();

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

  public constructor() {
    // Hidden means absent: a hidden input is emptied and disabled, so it drops out of form.value
    // and form.invalid. All writes use emitEvent:false, so this cannot feed back into valueChanges.
    effect(() => {
      const visible = this.visibleIds();
      const fields = this.definition().fields;
      untracked(() => {
        for (const field of fields) {
          if (!isInputField(field)) continue;
          const control = this._form.get(field.key);
          if (!control) continue;
          if (visible.has(field.id)) {
            if (control.disabled) control.enable({ emitEvent: false });
          } else if (control.enabled) {
            control.reset(defaultFor(field), { emitEvent: false });
            control.disable({ emitEvent: false });
          }
        }
      });
    });
  }

  public ngOnInit(): void {
    const controls: Record<string, FormControl> = {};
    for (const field of this.definition().fields) {
      // Display-only elements (label, divider) hold no value — no control, not submitted.
      if (!isInputField(field)) continue;
      controls[field.key] = new FormControl(defaultFor(field), validatorsFor(field));
    }
    // Honeypot — always empty, no validators
    controls[this.honeypotKey()] = new FormControl('');
    // JS token — populated reactively by effect in parent
    controls['_jsToken'] = new FormControl(this.jsToken());
    this._form = new FormGroup(controls);

    this.updateVisibility();
    this._form.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => this.updateVisibility());
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

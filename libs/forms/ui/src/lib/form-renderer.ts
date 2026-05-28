import { Component, computed, input, OnInit, output } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { IonButton, IonList } from '@ionic/angular/standalone';
import { Field, FormDefinitionModel } from '@bk2/shared-models';
import { validatorsFor, defaultFor } from '@bk2/forms-util';
import { FieldRenderer } from './field-renderer';

@Component({
  selector: 'bk-form-renderer',
  standalone: true,
  imports: [ReactiveFormsModule, IonList, IonButton, FieldRenderer],
  styles: [`
    .hp-field { position: absolute; left: -9999px; aria-hidden: true; }
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

      <ion-list lines="none">
        @for (field of sortedFields(); track field.id) {
          <bk-field-renderer [field]="field" [control]="getControl(field)" />
        }
      </ion-list>
      <ion-button
        type="submit"
        expand="block"
        [disabled]="form().invalid || submitting()"
        style="margin: 16px;"
      >
        {{ submitLabel() }}
      </ion-button>
    </form>
  `,
})
export class FormRenderer implements OnInit {
  public readonly definition = input.required<FormDefinitionModel>();
  public readonly submitLabel = input('Absenden');
  public readonly submitting = input(false);
  public readonly jsToken = input('');
  public readonly submitted = output<Record<string, unknown>>();

  protected readonly sortedFields = computed(() =>
    [...this.definition().fields].sort((a, b) => a.order - b.order)
  );

  protected readonly honeypotKey = computed(() =>
    this.definition().honeypotKey || 'website'
  );

  private _form: FormGroup = new FormGroup({});

  protected form = computed(() => this._form);

  public ngOnInit(): void {
    const controls: Record<string, FormControl> = {};
    for (const field of this.definition().fields) {
      controls[field.key] = new FormControl(defaultFor(field), validatorsFor(field));
    }
    // Honeypot — always empty, no validators
    controls[this.honeypotKey()] = new FormControl('');
    // JS token — populated reactively by effect in parent
    controls['_jsToken'] = new FormControl(this.jsToken());
    this._form = new FormGroup(controls);
  }

  public updateJsToken(token: string): void {
    this._form.get('_jsToken')?.setValue(token, { emitEvent: false });
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

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
  template: `
    <form [formGroup]="form()" (ngSubmit)="onSubmit()">
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
  public readonly submitted = output<Record<string, unknown>>();

  protected readonly sortedFields = computed(() =>
    [...this.definition().fields].sort((a, b) => a.order - b.order)
  );

  private _form: FormGroup = new FormGroup({});

  protected form = computed(() => this._form);

  public ngOnInit(): void {
    const controls: Record<string, FormControl> = {};
    for (const field of this.definition().fields) {
      controls[field.key] = new FormControl(defaultFor(field), validatorsFor(field));
    }
    this._form = new FormGroup(controls);
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

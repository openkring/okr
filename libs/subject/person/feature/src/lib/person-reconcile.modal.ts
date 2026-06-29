// libs/subject/person/feature/src/lib/person-reconcile.modal.ts
import { Component, computed, inject, input, signal } from '@angular/core';
import { IonContent, IonItem, IonLabel, IonList, IonSegment, IonSegmentButton, ModalController } from '@ionic/angular/standalone';

import { ChangeConfirmation, ChangeConfirmationI18n, Header } from '@bk2/shared-ui';
import {
  computePersonFieldDiffs,
  PersonDuplicateCandidate,
  PersonFieldDiff,
  PersonI18n,
  PersonNewFormModel,
  ReconcilableField,
} from '@bk2/subject-person-util';

/** Maps each reconcilable field to its existing person-i18n label key. */
const FIELD_LABEL: Record<ReconcilableField, keyof PersonI18n> = {
  firstName: 'firstName_label',
  lastName: 'lastName_label',
  gender: 'gender_label',
  dateOfBirth: 'dateOfBirth_label',
  dateOfDeath: 'dateOfDeath_label',
  ssnId: 'ssnId_label',
  favEmail: 'email_label',
  favPhone: 'phone_label',
  favZipCode: 'zipCode_label',
};

@Component({
  selector: 'bk-person-reconcile-modal',
  standalone: true,
  imports: [Header, ChangeConfirmation, IonContent, IonList, IonItem, IonLabel, IonSegment, IonSegmentButton],
  template: `
    <bk-header [i18n]="{ title: i18n().reconcile_title() }" [isModal]="true" />
    <bk-change-confirmation [i18n]="confirmationI18n()" (cancelClicked)="cancel()" (saveClicked)="save()" />
    <ion-content class="ion-padding">
      <p>{{ i18n().reconcile_intro() }}</p>
      <ion-list>
        @for (d of diffs(); track d.field) {
          <ion-item lines="none">
            <ion-label>
              <h2>{{ labelFor(d.field) }}</h2>
              <ion-segment [value]="choiceFor(d.field)" (ionChange)="choose(d.field, $event.detail.value)">
                <ion-segment-button value="existing">
                  <ion-label>{{ i18n().reconcile_keep_existing() }}: {{ d.existingValue || '—' }}</ion-label>
                </ion-segment-button>
                <ion-segment-button value="new">
                  <ion-label>{{ i18n().reconcile_use_new() }}: {{ d.newValue }}</ion-label>
                </ion-segment-button>
              </ion-segment>
            </ion-label>
          </ion-item>
        }
      </ion-list>
    </ion-content>
  `,
})
export class PersonReconcileModal {
  private readonly modalController = inject(ModalController);

  public existing = input.required<PersonDuplicateCandidate>();
  public form = input.required<PersonNewFormModel>();
  public i18n = input.required<PersonI18n>();

  protected readonly diffs = computed<PersonFieldDiff[]>(() => computePersonFieldDiffs(this.existing(), this.form()));
  // per-field choice; 'existing' is the default (keep current data).
  private readonly choices = signal<Record<string, 'existing' | 'new'>>({});

  protected readonly confirmationI18n = computed(() => ({
    cancel: this.i18n().cancel(),
    save: this.i18n().save(),
  } as ChangeConfirmationI18n));

  protected labelFor(field: ReconcilableField): string {
    return this.i18n()[FIELD_LABEL[field]]();
  }

  protected choiceFor(field: ReconcilableField): 'existing' | 'new' {
    return this.choices()[field] ?? 'existing';
  }

  protected choose(field: ReconcilableField, value: unknown): void {
    const choice = value === 'new' ? 'new' : 'existing';
    this.choices.update((c) => ({ ...c, [field]: choice }));
  }

  protected save(): void {
    const resolved: Partial<Record<ReconcilableField, string>> = {};
    for (const d of this.diffs()) {
      if (this.choiceFor(d.field) === 'new') resolved[d.field] = d.newValue;
    }
    this.modalController.dismiss(resolved, 'confirm');
  }

  protected cancel(): void {
    this.modalController.dismiss(null, 'cancel');
  }
}

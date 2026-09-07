import { Component, computed, inject, input, linkedSignal, signal } from '@angular/core';
import { IonContent, ModalController } from '@ionic/angular/standalone';

import { UserModel } from '@okr/shared-models';
import { ChangeConfirmation, Header } from '@okr/shared-ui';
import { InvitePersonsFormData, InvitePersonsI18n, newInvitePersonsFormData } from '@okr/relationship-invitation-util';

import { InvitePersonsForm } from './invite-persons.form';

/**
 * Personen zu EINEM Vorkommen einladen.
 *
 * Bewusst kein Serienbezug: wer die ganze Serie braucht, wird Mitglied der Gruppe
 * (planning/specs/2026-09-06-open-events-invitation-model-spec.md, Entscheidung 8). Ein Gast, der
 * drei von dreissig Trainings mitrudert, wird dreimal eingeladen — das ist der Normalfall, nicht
 * ein Umweg.
 *
 * Reine Huelle: Kopfzeile, Aenderungsbestaetigung, ein Formular. Gespeichert wird im aufrufenden
 * Store, der das Ergebnis aus `dismiss` bekommt.
 */
@Component({
  selector: 'okr-invite-persons-modal',
  standalone: true,
  imports: [Header, ChangeConfirmation, InvitePersonsForm, IonContent],
  template: `
    <okr-header [i18n]="{ title: headerTitle() }" [isModal]="true" />
    @if (showConfirmation()) {
      <okr-change-confirmation [i18n]="changeConfirmationI18n()"
        (saveClicked)="save()" (cancelClicked)="cancel()" />
    }
    <ion-content class="ion-no-padding">
      @if (formData(); as formData) {
        <okr-invite-persons-form [formData]="formData" (formDataChange)="onFormDataChange($event)"
          [i18n]="i18n()" [currentUser]="currentUser()" [tenantId]="tenantId()" [excludeKeys]="excludeKeys()"
          [showForm]="showForm()" (dirty)="formDirty.set($event)" (valid)="formValid.set($event)" />
      }
    </ion-content>
  `,
})
export class InvitePersonsModal {
  private readonly modalController = inject(ModalController);

  // inputs
  public readonly i18n = input.required<InvitePersonsI18n>();
  public readonly currentUser = input<UserModel | undefined>();
  /** The tenant the invitation is written in — the picker offers only accounts of this tenant. */
  public readonly tenantId = input.required<string>();
  /** okeys the picker must not offer — the organiser and everybody already on the event. */
  public readonly excludeKeys = input<string[]>([]);

  public formData = linkedSignal(() => newInvitePersonsFormData());
  protected formDirty = signal(false);
  protected formValid = signal(false);
  protected showForm = signal(true);
  protected showConfirmation = computed(() => this.formValid() && this.formDirty());
  protected headerTitle = computed(() => this.i18n().invite_persons_title());
  protected changeConfirmationI18n = computed(() => ({
    cancel: this.i18n().cancel(),
    save: this.i18n().save(),
  }));

  protected onFormDataChange(data: InvitePersonsFormData): void {
    this.formData.set(data);
  }

  public async save(): Promise<void> {
    await this.modalController.dismiss(this.formData(), 'confirm');
  }

  /** Reverts to an empty selection and forces a fresh form so no stale state survives. */
  public cancel(): void {
    this.formDirty.set(false);
    this.formValid.set(false);
    this.formData.set(newInvitePersonsFormData());
    this.showForm.set(false);
    setTimeout(() => this.showForm.set(true), 0);
  }
}

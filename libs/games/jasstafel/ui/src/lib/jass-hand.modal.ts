import { Component, computed, inject, input, linkedSignal, signal } from '@angular/core';
import { IonContent, ModalController } from '@ionic/angular/standalone';

import { JassGame, JassHandFormModel, JassI18n, openRows } from '@okr/games-jasstafel-util';
import { ChangeConfirmation, ChangeConfirmationI18n, Header } from '@okr/shared-ui';
import { dismissOverlay } from '@okr/shared-util-angular';
import { safeStructuredClone } from '@okr/shared-util-core';

import { JassHandForm } from './jass-hand.form';

@Component({
  selector: 'okr-jass-hand-modal',
  standalone: true,
  imports: [Header, ChangeConfirmation, JassHandForm, IonContent],
  template: `
    <okr-header [i18n]="{ title: headerTitle() }" [isModal]="true" />
    @if (showConfirmation()) {
      <okr-change-confirmation [i18n]="changeConfirmationI18n()" (cancelClicked)="cancel()" (saveClicked)="save()" />
    }
    <ion-content class="ion-no-padding">
      @if (formData(); as formData) {
        <okr-jass-hand-form [formData]="formData" (formDataChange)="onFormDataChange($event)"
          [game]="game()" [trumpMakerIdx]="trumpMakerIdx()" [i18n]="i18n()" [showForm]="showForm()"
          (dirty)="formDirty.set($event)" (valid)="formValid.set($event)" />
      }
    </ion-content>
  `,
})
export class JassHandModal {
  private readonly modalController = inject(ModalController);

  public readonly game = input.required<JassGame>();
  public readonly model = input.required<JassHandFormModel>();
  public readonly trumpMakerIdx = input.required<number>();
  public readonly i18n = input.required<JassI18n>();
  /** the index of the hand being edited, so its own Coiffeur row stays selectable */
  public readonly editIndex = input<number | undefined>(undefined);

  protected formDirty = signal(false);
  protected formValid = signal(false);
  public formData = linkedSignal(() => safeStructuredClone(this.model()));
  protected showForm = signal(true);

  protected readonly headerTitle = computed(() =>
    this.model().phase === 'announce' ? this.i18n().announce_title() : this.i18n().hand_title());
  protected showConfirmation = computed(() => this.formValid() && this.formDirty());
  protected readonly changeConfirmationI18n = computed(() => ({
    cancel: this.i18n().changeConfirmation_cancel(),
    save: this.i18n().changeConfirmation_ok(),
  }) as ChangeConfirmationI18n);

  public async save(): Promise<void> {
    await dismissOverlay(this.modalController, this.formData(), 'confirm');
  }

  public cancel(): void {
    this.formDirty.set(false);
    this.formData.set(safeStructuredClone(this.model()));
    this.showForm.set(false);
    setTimeout(() => this.showForm.set(true), 0);
  }

  /** Coiffeur: switching the team changes which rows are still open for it. */
  protected onFormDataChange(next: JassHandFormModel): void {
    const prev = this.formData();
    if (next.variant === 'coiffeur' && next.sideId !== prev?.sideId) {
      const trumpOptions = openRows(this.game(), next.sideId, this.editIndex()).map(r => r.id);
      next = { ...next, trumpOptions, trump: trumpOptions.includes(next.trump) ? next.trump : '' };
    }
    this.formData.set(next);
  }
}

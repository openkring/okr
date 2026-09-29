import { Component, computed, inject, input, linkedSignal, signal } from '@angular/core';
import { IonContent, ModalController } from '@ionic/angular/standalone';

import { JassConfig, JassI18n, normalizeConfig } from '@okr/games-jasstafel-util';
import { ChangeConfirmation, ChangeConfirmationI18n, Header } from '@okr/shared-ui';
import { dismissOverlay } from '@okr/shared-util-angular';
import { safeStructuredClone } from '@okr/shared-util-core';

import { JassSettingsForm } from './jass-settings.form';

@Component({
  selector: 'okr-jass-settings-modal',
  standalone: true,
  imports: [Header, ChangeConfirmation, JassSettingsForm, IonContent],
  template: `
    <okr-header [i18n]="{ title: i18n().settings_title() }" [isModal]="true" />
    @if (showConfirmation()) {
      <okr-change-confirmation [i18n]="changeConfirmationI18n()" (cancelClicked)="cancel()" (saveClicked)="save()" />
    }
    <ion-content class="ion-no-padding">
      <p class="ion-padding-horizontal">{{ i18n().settings_next_game() }}</p>
      @if (formData(); as formData) {
        <okr-jass-settings-form [formData]="formData" (formDataChange)="onFormDataChange($event)"
          [i18n]="i18n()" [showForm]="showForm()"
          (dirty)="formDirty.set($event)" (valid)="formValid.set($event)" />
      }
    </ion-content>
  `,
})
export class JassSettingsModal {
  private readonly modalController = inject(ModalController);

  public readonly config = input.required<JassConfig>();
  public readonly i18n = input.required<JassI18n>();

  protected formDirty = signal(false);
  protected formValid = signal(false);
  public formData = linkedSignal(() => safeStructuredClone(this.config()));
  protected showForm = signal(true);
  protected showConfirmation = computed(() => this.formValid() && this.formDirty());
  protected readonly changeConfirmationI18n = computed(() => ({
    cancel: this.i18n().changeConfirmation_cancel(),
    save: this.i18n().changeConfirmation_ok(),
  }) as ChangeConfirmationI18n);

  public async save(): Promise<void> {
    await dismissOverlay(this.modalController, normalizeConfig(this.formData()), 'confirm');
  }

  public cancel(): void {
    this.formDirty.set(false);
    this.formData.set(safeStructuredClone(this.config()));
    this.showForm.set(false);
    setTimeout(() => this.showForm.set(true), 0);
  }

  protected onFormDataChange(next: JassConfig): void {
    this.formData.set(next);
  }
}

import { Component, computed, inject, input, linkedSignal, signal } from '@angular/core';
import { IonContent, ModalController } from '@ionic/angular/standalone';

import { I18nService } from '@okr/shared-i18n';
import { AliasModel, UserModel } from '@okr/shared-models';
import { ChangeConfirmation, ChangeConfirmationI18n, Header } from '@okr/shared-ui';
import { dismissOverlay } from '@okr/shared-util-angular';
import { coerceBoolean, safeStructuredClone } from '@okr/shared-util-core';
import { ALIAS_I18N_KEYS, AliasI18n } from '@okr/system-alias-util';

import { AliasForm } from './alias.form';

/**
 * Container für das Alias-Formular — Header, Change-Confirmation, ein Formular. Nichts sonst.
 *
 * Speichert NICHT selbst: der Aufrufer (die Liste über ihren Store) bekommt das bearbeitete
 * Modell per `dismiss(..., 'confirm')` zurück und entscheidet, ob daraus ein `createAlias`-Aufruf
 * oder ein Update wird. Deshalb injiziert dieses Modal auch keinen Store und braucht kein
 * `providers`-Array.
 */
@Component({
  selector: 'okr-alias-edit-modal',
  standalone: true,
  imports: [Header, ChangeConfirmation, AliasForm, IonContent],
  template: `
    <okr-header [i18n]="{ title: headerTitle() }" [isModal]="true" />
    @if (showConfirmation()) {
      <okr-change-confirmation [i18n]="changeConfirmationI18n()"
        (cancelClicked)="cancel()" (saveClicked)="save()" />
    }
    <ion-content class="ion-no-padding">
      @if (formData(); as formData) {
        <okr-alias-form
          [formData]="formData"
          (formDataChange)="onFormDataChange($event)"
          [i18n]="i18n"
          [currentUser]="currentUser()"
          [tenantId]="tenantId()"
          [allTags]="allTags()"
          [readOnly]="isReadOnly()"
          [showForm]="showForm()"
          (dirty)="formDirty.set($event)"
          (valid)="formValid.set($event)"
        />
      }
    </ion-content>
  `,
})
export class AliasEditModal {
  private readonly modalController = inject(ModalController);
  protected readonly i18n = inject(I18nService).translateAll(ALIAS_I18N_KEYS) as AliasI18n;

  public readonly alias = input.required<AliasModel>();
  public readonly currentUser = input<UserModel | undefined>();
  public readonly tenantId = input.required<string>();
  public readonly allTags = input('');
  public readonly readOnly = input(true);

  protected readonly isReadOnly = computed(() => coerceBoolean(this.readOnly()));
  protected readonly formDirty = signal(false);
  protected readonly formValid = signal(false);
  protected readonly showConfirmation = computed(() => this.formValid() && this.formDirty());
  protected readonly showForm = signal(true);

  public formData = linkedSignal(() => safeStructuredClone(this.alias()));

  protected readonly headerTitle = computed(() => {
    if (this.isReadOnly()) return this.i18n.action_view();
    return this.alias()?.okey ? this.i18n.action_update() : this.i18n.action_create();
  });

  protected readonly changeConfirmationI18n = computed(() => ({
    cancel: this.i18n.action_cancel(),
    save: this.i18n.action_save(),
  } as ChangeConfirmationI18n));

  protected onFormDataChange(formData: AliasModel): void {
    this.formData.set(formData);
  }

  public async save(): Promise<void> {
    await dismissOverlay(this.modalController, this.formData(), 'confirm');
  }

  /** Zurücksetzen UND das Formular neu aufbauen — sonst behält Vest die alten Fehler. */
  public cancel(): void {
    this.formDirty.set(false);
    this.formData.set(safeStructuredClone(this.alias()));
    this.showForm.set(false);
    setTimeout(() => this.showForm.set(true), 0);
  }
}

import { Component, computed, inject, input, linkedSignal, signal } from '@angular/core';
import { IonContent, ModalController } from '@ionic/angular';

import { TileItem, TileVariant } from '@okr/shared-models';
import { ChangeConfirmation, ChangeConfirmationI18n, Header } from '@okr/shared-ui';
import { SectionI18n, SectionIconPicker } from '@okr/cms-section-util';
import { dismissOverlay } from '@okr/shared-util-angular';
import { safeStructuredClone } from '@okr/shared-util-core';

import { TileForm } from './tile.form';

/** Edits one tile of a tiles section. Dismisses with the edited TileItem and role 'confirm'. */
@Component({
  selector: 'okr-tile-edit-modal',
  standalone: true,
  imports: [Header, ChangeConfirmation, TileForm, IonContent],
  template: `
    <okr-header [i18n]="{ title: i18n().tiles_editTitle() }" [isModal]="true" />
    @if (showConfirmation()) {
      <okr-change-confirmation [i18n]="changeConfirmationI18n()" (saveClicked)="save()" (cancelClicked)="cancel()" />
    }
    <ion-content class="ion-no-padding">
      @if (formData(); as formData) {
        <okr-tile-form
          [formData]="formData"
          (formDataChange)="onFormDataChange($event)"
          [variant]="variant()"
          [i18n]="i18n()"
          [readOnly]="readOnly()"
          [showForm]="showForm()"
          (iconSelectClicked)="selectIcon()"
          (dirty)="formDirty.set($event)"
          (valid)="formValid.set($event)"
        />
      }
    </ion-content>
  `,
})
export class TileEditModal {
  private readonly modalController = inject(ModalController);

  // inputs
  public readonly tile = input.required<TileItem>();
  public readonly variant = input.required<TileVariant>();
  public readonly readOnly = input<boolean>(true);
  public readonly i18n = input.required<SectionI18n>();
  /** handed over by the tiles configuration; without it the icon name is typed by hand */
  public readonly iconPicker = input<SectionIconPicker | undefined>();

  // state
  protected readonly formData = linkedSignal(() => safeStructuredClone(this.tile()));
  protected readonly formDirty = signal(false);
  protected readonly formValid = signal(false);
  protected readonly showForm = signal(true);
  protected readonly showConfirmation = computed(() => this.formValid() && this.formDirty());
  protected readonly changeConfirmationI18n = computed(() => ({
    cancel: this.i18n().cancel(),
    save: this.i18n().save(),
  } as ChangeConfirmationI18n));

  protected onFormDataChange(formData: TileItem): void {
    this.formData.set(formData);
  }

  protected async selectIcon(): Promise<void> {
    const picker = this.iconPicker();
    if (!picker || this.readOnly()) return;
    const icon = await picker.pick(this.formData()?.icon);
    const current = this.formData();
    if (!icon || !current) return;
    this.formData.set({ ...current, icon });
    this.formDirty.set(true);
  }

  public async save(): Promise<void> {
    await dismissOverlay(this.modalController, this.formData(), 'confirm');
  }

  /** revert to the stored tile and force a fresh form (clears the Vest state) */
  public cancel(): void {
    this.formDirty.set(false);
    this.formData.set(safeStructuredClone(this.tile()));
    this.showForm.set(false);
    setTimeout(() => this.showForm.set(true), 0);
  }
}

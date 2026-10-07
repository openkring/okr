import { Component, computed, inject, input, linkedSignal, signal } from '@angular/core';
import { IonContent, ModalController } from '@ionic/angular/standalone';

import { I18nService } from '@okr/shared-i18n';
import { AssetCategoryModel, AssetModel, CostCenterModel, UserModel } from '@okr/shared-models';
import { ChangeConfirmation, ChangeConfirmationI18n, Header } from '@okr/shared-ui';
import { dismissOverlay } from '@okr/shared-util-angular';
import { coerceBoolean, safeStructuredClone } from '@okr/shared-util-core';

import { ASSET_I18N_KEYS, AssetI18n } from '@okr/finance-asset-util';

import { AssetForm } from './asset.form';

@Component({
  selector: 'okr-asset-edit-modal',
  standalone: true,
  imports: [Header, ChangeConfirmation, AssetForm, IonContent],
  template: `
    <okr-header [i18n]="{ title: headerTitle() }" [isModal]="true" />
    @if (showConfirmation()) {
      <okr-change-confirmation [i18n]="changeConfirmationI18n()" (cancelClicked)="cancel()" (saveClicked)="save()" />
    }
    <ion-content class="ion-no-padding">
      @if (formData(); as formData) {
        <okr-asset-form
          [formData]="formData"
          (formDataChange)="onFormDataChange($event)"
          [categories]="categories()"
          [costCenters]="costCenters()"
          [costCenterEnabled]="costCenterEnabled()"
          [showForm]="showForm()"
          [readOnly]="isReadOnly()"
          [i18n]="i18n"
          (dirty)="formDirty.set($event)"
          (valid)="formValid.set($event)"
        />
      }
    </ion-content>
  `,
})
export class AssetEditModal {
  private readonly modalController = inject(ModalController);
  // direct inject, no store: the store opens this modal, importing it back would be circular
  protected readonly i18n = inject(I18nService).translateAll(ASSET_I18N_KEYS) as AssetI18n;

  // inputs
  public readonly asset = input.required<AssetModel>();
  public readonly categories = input<AssetCategoryModel[]>([]);
  public readonly readOnly = input<boolean>(true);
  public readonly currentUser = input<UserModel | undefined>(undefined);
  /** Kostenstellen to pick from; the picker only shows when the cost-centre feature is enabled for the book */
  public readonly costCenters = input<CostCenterModel[]>([]);
  public readonly costCenterEnabled = input(false);
  protected readonly isReadOnly = computed(() => coerceBoolean(this.readOnly()));

  protected formDirty = signal(false);
  protected formValid = signal(false);
  public formData = linkedSignal(() => safeStructuredClone(this.asset()));
  protected showForm = signal(true);

  protected showConfirmation = computed(() => this.formValid() && this.formDirty());
  protected readonly headerTitle = computed(() =>
    this.isReadOnly() ? this.i18n.view() : (this.asset().okey ? this.i18n.update() : this.i18n.create()));
  protected readonly changeConfirmationI18n = computed(() => ({
    cancel: this.i18n.cancel(),
    save: this.i18n.save(),
  } as ChangeConfirmationI18n));

  public async save(): Promise<void> {
    await dismissOverlay(this.modalController, this.formData(), 'confirm');
  }

  public cancel(): void {
    this.formDirty.set(false);
    this.formData.set(safeStructuredClone(this.asset()));
    this.showForm.set(false);
    setTimeout(() => this.showForm.set(true), 0);   // fresh form → clears stale Vest state
  }

  protected onFormDataChange(formData: AssetModel): void {
    this.formData.set(formData);
  }
}

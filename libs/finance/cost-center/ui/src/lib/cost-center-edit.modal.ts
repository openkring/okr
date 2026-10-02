import { Component, computed, inject, input, linkedSignal, signal } from '@angular/core';
import { IonContent, ModalController } from '@ionic/angular/standalone';

import { I18nService } from '@okr/shared-i18n';
import { CostCenterModel, ResponsibilityModel, UserModel } from '@okr/shared-models';
import { ChangeConfirmation, ChangeConfirmationI18n, Header } from '@okr/shared-ui';
import { dismissOverlay } from '@okr/shared-util-angular';
import { coerceBoolean, safeStructuredClone } from '@okr/shared-util-core';

import { COST_CENTER_I18N_KEYS, CostCenterI18n } from '@okr/finance-cost-center-util';

import { CostCenterForm } from './cost-center.form';

/**
 * Edits one Kostenstelle: header + change-confirmation + `okr-cost-center-form`. Presentational —
 * it touches no store or service; the opener (CostCenterStore) persists what this dismisses with
 * role 'confirm'. The responsibility picker lives in `@okr/shared-feature`, which a ui lib must not
 * import, so the opener hands it in as `selectResponsibility`.
 */
@Component({
  selector: 'okr-cost-center-edit-modal',
  standalone: true,
  imports: [Header, ChangeConfirmation, CostCenterForm, IonContent],
  template: `
    <okr-header [i18n]="{ title: headerTitle() }" [isModal]="true" />
    @if (showConfirmation()) {
      <okr-change-confirmation [i18n]="changeConfirmationI18n()" (saveClicked)="save()" (cancelClicked)="cancel()" />
    }
    <ion-content class="ion-no-padding">
      @if (formData(); as formData) {
        <okr-cost-center-form
          [formData]="formData" (formDataChange)="onFormDataChange($event)"
          [i18n]="i18n"
          [costCenters]="costCenters()"
          [responsibilities]="knownResponsibilities()"
          [currentUser]="currentUser()"
          [readOnly]="isReadOnly()"
          [showForm]="showForm()"
          (dirty)="formDirty.set($event)"
          (valid)="formValid.set($event)"
          (responsibilitySelectClicked)="onSelectResponsibility()"
        />
      }
    </ion-content>
  `
})
export class CostCenterEditModal {
  private readonly modalController = inject(ModalController);
  protected readonly i18n = inject(I18nService).translateAll(COST_CENTER_I18N_KEYS) as CostCenterI18n;

  // inputs (componentProps)
  public readonly costCenter = input.required<CostCenterModel>();
  public readonly costCenters = input<CostCenterModel[]>([]);
  public readonly responsibilities = input<ResponsibilityModel[]>([]);
  public readonly currentUser = input<UserModel | undefined>();
  public readonly readOnly = input(true);
  /** opens the responsibility picker; undefined = cancelled */
  public readonly selectResponsibility = input<() => Promise<ResponsibilityModel | undefined>>();

  protected isReadOnly = computed(() => coerceBoolean(this.readOnly()));
  protected formDirty = signal(false);
  protected formValid = signal(false);
  protected showConfirmation = computed(() => this.formValid() && this.formDirty());
  protected showForm = signal(true);
  public formData = linkedSignal(() => safeStructuredClone(this.costCenter()));
  /** the given list plus whatever was just picked, so the form can always show its name */
  protected knownResponsibilities = linkedSignal(() => this.responsibilities());

  protected readonly changeConfirmationI18n = computed(() => ({ cancel: this.i18n.cancel(), save: this.i18n.save() } as ChangeConfirmationI18n));
  protected headerTitle = computed(() => {
    if (this.isReadOnly()) return this.i18n.view();
    return this.costCenter().okey ? this.i18n.update() : this.i18n.create();
  });

  public async save(): Promise<void> {
    await dismissOverlay(this.modalController, this.formData(), 'confirm');
  }

  public cancel(): void {
    this.formDirty.set(false);
    this.formData.set(safeStructuredClone(this.costCenter()));
    this.showForm.set(false);
    setTimeout(() => this.showForm.set(true), 0);
  }

  protected onFormDataChange(formData: CostCenterModel): void {
    this.formData.set(formData);
  }

  protected async onSelectResponsibility(): Promise<void> {
    const _select = this.selectResponsibility();
    if (!_select || this.isReadOnly()) return;
    const _responsibility = await _select();
    if (!_responsibility) return;
    if (!this.knownResponsibilities().some(r => r.okey === _responsibility.okey)) {
      this.knownResponsibilities.update(list => [...list, _responsibility]);
    }
    const _current = this.formData();
    if (!_current) return;
    this.formData.set({ ..._current, responsibilityKey: _responsibility.okey });
    this.formDirty.set(true);
  }
}

import { Component, computed, effect, input, model, output } from '@angular/core';
import { form } from '@angular/forms/signals';
import { IonButton, IonButtons, IonCard, IonCardContent, IonCol, IonGrid, IonIcon, IonItem, IonLabel, IonNote, IonRow } from '@ionic/angular/standalone';

import { DESCRIPTION_LENGTH } from '@okr/shared-constants';
import { CostCenterModel, CostCenterType, ResponsibilityModel, RoleName, UserModel } from '@okr/shared-models';
import { SvgIconPipe } from '@okr/shared-pipes';
import { ErrorNote, NotesInput, NotesInputI18n, StringSelect, StringSelectI18n, TextInput, TextInputI18n } from '@okr/shared-ui';
import { validateVestTree } from '@okr/shared-util-angular';
import { coerceBoolean, hasRole } from '@okr/shared-util-core';

import {
  COST_CENTER_ID_LENGTH, COST_CENTER_NAME_LENGTH, CostCenterFormModel, CostCenterI18n, costCenterLabel,
  costCenterSubtreeKeys, costCenterValidations
} from '@okr/finance-cost-center-util';

export type { CostCenterI18n };

const COST_CENTER_TYPES: CostCenterType[] = ['root', 'group', 'leaf'];

/**
 * The Kostenstelle master-data form: number, name, parent, type, responsibility, notes.
 * Presentational only — the responsibility picker is opened by the parent (it needs
 * `@okr/shared-feature`, which a ui lib must not import); the form just emits
 * `responsibilitySelectClicked` and shows the chosen responsibility's name.
 */
@Component({
  selector: 'okr-cost-center-form',
  standalone: true,
  imports: [
    SvgIconPipe,
    TextInput, StringSelect, NotesInput, ErrorNote,
    IonGrid, IonRow, IonCol, IonCard, IonCardContent, IonItem, IonLabel, IonNote, IonButtons, IonButton, IonIcon
  ],
  styles: [`@media (width <= 600px) { ion-card { margin: 5px; } }`],
  template: `
    @if (showForm()) {
      <form novalidate>
        <ion-card>
          <ion-card-content class="ion-no-padding">
            <ion-grid>
              <ion-row>
                <ion-col size="12" size-md="6">
                  <okr-text-input [i18n]="idI18n()" [value]="id()" (valueChange)="onFieldChange('id', $event)"
                    [autofocus]="true" [maxLength]="idLength" [readOnly]="isReadOnly()" />
                  <okr-error-note [errors]="idErrors()" />
                </ion-col>
                <ion-col size="12" size-md="6">
                  <okr-text-input [i18n]="nameI18n()" [value]="name()" (valueChange)="onFieldChange('name', $event)"
                    [maxLength]="nameLength" [readOnly]="isReadOnly()" />
                  <okr-error-note [errors]="nameErrors()" />
                </ion-col>
              </ion-row>
              <ion-row>
                <ion-col size="12" size-md="6">
                  <okr-string-select [i18n]="parentKeyI18n()" [selectedString]="parentKey()" (selectedStringChange)="onFieldChange('parentKey', $event)"
                    [stringList]="parentKeys()" [labels]="parentLabels()" [readOnly]="isReadOnly()" />
                  <okr-error-note [errors]="parentKeyErrors()" />
                </ion-col>
                <ion-col size="12" size-md="6">
                  <okr-string-select [i18n]="typeI18n()" [selectedString]="type()" (selectedStringChange)="onFieldChange('type', $event)"
                    [stringList]="types" [labels]="typeLabels()" [readOnly]="isReadOnly()" />
                  <okr-error-note [errors]="typeErrors()" />
                </ion-col>
              </ion-row>
              <ion-row>
                <ion-col size="12">
                  <ion-item lines="none">
                    <ion-label>
                      <p>{{ i18n().responsibility() }}</p>
                      <h3>{{ responsibilityName() || i18n().responsibility_none() }}</h3>
                    </ion-label>
                    @if (!isReadOnly()) {
                      <ion-buttons slot="end">
                        <ion-button fill="outline" (click)="responsibilitySelectClicked.emit()">
                          <ion-icon slot="start" src="{{ 'search' | svgIcon }}" />
                          {{ i18n().responsibility_select() }}
                        </ion-button>
                        @if (responsibilityKey()) {
                          <ion-button fill="clear" (click)="onFieldChange('responsibilityKey', '')" [attr.aria-label]="i18n().responsibility_clear()">
                            <ion-icon slot="icon-only" src="{{ 'cancel-circle' | svgIcon }}" />
                          </ion-button>
                        }
                      </ion-buttons>
                    }
                  </ion-item>
                  <ion-item lines="none">
                    <ion-note style="white-space: pre-line">{{ i18n().responsibility_helper() }}</ion-note>
                  </ion-item>
                  <okr-error-note [errors]="responsibilityKeyErrors()" />
                </ion-col>
              </ion-row>
            </ion-grid>
          </ion-card-content>
        </ion-card>

        @if (hasRole('treasurer')) {
          <okr-notes-input [i18n]="notesI18n()" [value]="notes()" (valueChange)="onFieldChange('notes', $event)"
            [maxLength]="descriptionLength" [readOnly]="isReadOnly()" [errors]="notesErrors()" />
        }
      </form>
    }
  `
})
export class CostCenterForm {
  /** kept in step with the caps the Vest suite enforces on these fields */
  protected readonly idLength = COST_CENTER_ID_LENGTH;
  protected readonly nameLength = COST_CENTER_NAME_LENGTH;
  protected readonly descriptionLength = DESCRIPTION_LENGTH;
  protected readonly types = COST_CENTER_TYPES;

  // inputs
  public readonly formData = model.required<CostCenterModel>();
  public readonly i18n = input.required<CostCenterI18n>();
  /** every cost centre of the accounting tenant (archived included) — parent options and the suite's context */
  public readonly costCenters = input<CostCenterModel[]>([]);
  /** to show the selected responsibility's name */
  public readonly responsibilities = input<ResponsibilityModel[]>([]);
  public readonly currentUser = input<UserModel | undefined>();
  public readonly readOnly = input(true);
  public readonly showForm = input(true);

  // outputs
  public readonly dirty = output<boolean>();
  public readonly valid = output<boolean>();
  public readonly responsibilitySelectClicked = output<void>();

  protected isReadOnly = computed(() => coerceBoolean(this.readOnly()));

  // The suite needs the other cost centres (unique number, cycle, leaf-has-children), which
  // validateVestTree does not pass — so the bridge calls it through a closure that adds them.
  private readonly suiteWithContext = (model: CostCenterFormModel, field?: string) =>
    costCenterValidations(model, this.costCenters(), field);
  protected readonly costCenterForm = form(this.formData, (path) =>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    validateVestTree(path, this.suiteWithContext as any));

  private readonly validationResult = computed(() => costCenterValidations(this.formData(), this.costCenters()));
  protected idErrors = computed(() => this.validationResult().getErrors('id'));
  protected nameErrors = computed(() => this.validationResult().getErrors('name'));
  protected parentKeyErrors = computed(() => this.validationResult().getErrors('parentKey'));
  protected typeErrors = computed(() => this.validationResult().getErrors('type'));
  protected responsibilityKeyErrors = computed(() => this.validationResult().getErrors('responsibilityKey'));
  protected notesErrors = computed(() => this.validationResult().getErrors('notes'));

  // fields
  protected id = computed(() => this.formData().id ?? '');
  protected name = computed(() => this.formData().name ?? '');
  protected parentKey = computed(() => this.formData().parentKey ?? '');
  protected type = computed(() => this.formData().type ?? 'leaf');
  protected responsibilityKey = computed(() => this.formData().responsibilityKey ?? '');
  protected notes = computed(() => this.formData().notes ?? '');

  protected responsibilityName = computed(() => {
    const _key = this.responsibilityKey();
    if (!_key) return '';
    return this.responsibilities().find(r => r.okey === _key)?.name ?? _key;
  });

  /**
   * Parent options: '' (top level) plus the active roots and groups of the same accounting tenant,
   * minus the node itself and its own subtree. The current parent stays listed even if it no longer
   * qualifies, so the select never silently shows a different value than the one stored.
   */
  private readonly parentCandidates = computed(() => {
    const _self = this.formData();
    const _excluded = _self.okey ? costCenterSubtreeKeys(this.costCenters(), _self.okey) : new Set<string>();
    return this.costCenters()
      .filter(c => c.accountingTenantId === _self.accountingTenantId)
      .filter(c => c.okey === _self.parentKey || (!c.isArchived && c.type !== 'leaf' && !_excluded.has(c.okey)))
      .sort((a, b) => a.id.localeCompare(b.id, 'de', { numeric: true }));
  });
  protected parentKeys = computed(() => ['', ...this.parentCandidates().map(c => c.okey)]);
  protected parentLabels = computed(() => [this.i18n().parentKey_none(), ...this.parentCandidates().map(c => costCenterLabel(c))]);

  protected typeLabels = computed(() => [this.i18n().type_root(), this.i18n().type_group(), this.i18n().type_leaf()]);

  // per-field i18n for the shared/ui primitives
  protected idI18n = computed(() => ({
    name: 'id', label: this.i18n().id(), placeholder: this.i18n().id_placeholder(), helper: this.i18n().id_helper()
  } as TextInputI18n));
  protected nameI18n = computed(() => ({
    name: 'name', label: this.i18n().name(), placeholder: this.i18n().name_placeholder(), helper: this.i18n().name_helper()
  } as TextInputI18n));
  protected parentKeyI18n = computed(() => ({
    name: 'parentKey', label: this.i18n().parentKey(), helper: this.i18n().parentKey_helper()
  } as StringSelectI18n));
  protected typeI18n = computed(() => ({
    name: 'type', label: this.i18n().type(), helper: this.i18n().type_helper()
  } as StringSelectI18n));
  protected notesI18n = computed(() => ({
    name: 'notes', label: this.i18n().notes(), placeholder: this.i18n().notes_placeholder()
  } as NotesInputI18n));

  constructor() {
    effect(() => this.valid.emit(this.costCenterForm().valid()));
  }

  protected onFieldChange(fieldName: keyof CostCenterFormModel, fieldValue: string): void {
    this.dirty.emit(true);
    this.formData.update((vm) => ({ ...vm, [fieldName]: fieldValue }));
  }

  protected hasRole(role: RoleName): boolean {
    return hasRole(role, this.currentUser());
  }
}

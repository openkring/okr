import { Component, computed, effect, input, model, output } from '@angular/core';
import { form } from '@angular/forms/signals';
import { IonCard, IonCardContent, IonCol, IonGrid, IonRow } from '@ionic/angular/standalone';

import { Checkbox, CheckboxI18n } from '@okr/shared-ui';
import { coerceBoolean } from '@okr/shared-util-core';
import { validateVestTree } from '@okr/shared-util-angular';
import { ContextDiagramConfigFormModel, contextDiagramConfigValidations, SectionI18n } from '@okr/cms-section-util';

type ContextDiagramSwitch = 'showAvatar' | 'showName' | 'showMembers' | 'showMemberships' | 'showResponsibilities' |
  'showPersonalRels' | 'showWorkRels' | 'saveChanges';

/** Display settings of a context diagram (on/off switches). Work relationships and "save" are for member admins only. */
@Component({
  selector: 'okr-context-diagram-config-form',
  standalone: true,
  imports: [Checkbox, IonGrid, IonRow, IonCol, IonCard, IonCardContent],
  styles: [`@media (width <= 600px) { ion-card { margin: 5px;} }`],
  template: `
    @if (showForm()) {
      <form novalidate>
        <ion-card>
          <ion-card-content class="ion-no-padding">
            <ion-grid>
              <ion-row>
                <ion-col size="12" size-md="6">
                  <okr-checkbox [i18n]="showAvatarI18n()" [checked]="formData().showAvatar" (checkedChange)="onFieldChange('showAvatar', $event)"
                    [toggle]="true" justify="space-between" labelPlacement="start" [readOnly]="isReadOnly()" />
                </ion-col>
                <ion-col size="12" size-md="6">
                  <okr-checkbox [i18n]="showNameI18n()" [checked]="formData().showName" (checkedChange)="onFieldChange('showName', $event)"
                    [toggle]="true" justify="space-between" labelPlacement="start" [readOnly]="isReadOnly()" />
                </ion-col>
              </ion-row>
              <ion-row>
                <ion-col size="12" size-md="6">
                  <okr-checkbox [i18n]="showMembersI18n()" [checked]="formData().showMembers" (checkedChange)="onFieldChange('showMembers', $event)"
                    [toggle]="true" justify="space-between" labelPlacement="start" [readOnly]="isReadOnly()" />
                </ion-col>
                <ion-col size="12" size-md="6">
                  <okr-checkbox [i18n]="showMembershipsI18n()" [checked]="formData().showMemberships" (checkedChange)="onFieldChange('showMemberships', $event)"
                    [toggle]="true" justify="space-between" labelPlacement="start" [readOnly]="isReadOnly()" />
                </ion-col>
              </ion-row>
              <ion-row>
                <ion-col size="12" size-md="6">
                  <okr-checkbox [i18n]="showResponsibilitiesI18n()" [checked]="formData().showResponsibilities" (checkedChange)="onFieldChange('showResponsibilities', $event)"
                    [toggle]="true" justify="space-between" labelPlacement="start" [readOnly]="isReadOnly()" />
                </ion-col>
                <ion-col size="12" size-md="6">
                  <okr-checkbox [i18n]="showPersonalRelsI18n()" [checked]="formData().showPersonalRels" (checkedChange)="onFieldChange('showPersonalRels', $event)"
                    [toggle]="true" justify="space-between" labelPlacement="start" [readOnly]="isReadOnly()" />
                </ion-col>
              </ion-row>
              @if (isMemberAdmin()) {
                <ion-row>
                  <ion-col size="12" size-md="6">
                    <okr-checkbox [i18n]="showWorkRelsI18n()" [checked]="formData().showWorkRels" (checkedChange)="onFieldChange('showWorkRels', $event)"
                      [toggle]="true" justify="space-between" labelPlacement="start" [readOnly]="isReadOnly()" />
                  </ion-col>
                  <ion-col size="12" size-md="6">
                    <okr-checkbox [i18n]="saveChangesI18n()" [checked]="formData().saveChanges" (checkedChange)="onFieldChange('saveChanges', $event)"
                      [toggle]="true" justify="space-between" labelPlacement="start" [readOnly]="isReadOnly()" />
                  </ion-col>
                </ion-row>
              }
            </ion-grid>
          </ion-card-content>
        </ion-card>
      </form>
    }
  `,
})
export class ContextDiagramConfigForm {
  // inputs
  public readonly i18n = input.required<SectionI18n>();
  public formData = model.required<ContextDiagramConfigFormModel>();
  /** member admins may also show work relationships and save the settings as the section default */
  public readonly isMemberAdmin = input(false);
  public readonly readOnly = input(false);
  public readonly showForm = input(true);

  // outputs
  public readonly dirty = output<boolean>();
  public readonly valid = output<boolean>();

  // signal form — wraps formData with Vest validation
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  protected readonly configForm = form(this.formData, (path) => validateVestTree(path, contextDiagramConfigValidations as any));

  constructor() {
    effect(() => this.valid.emit(this.configForm().valid()));
  }

  protected readonly isReadOnly = computed(() => coerceBoolean(this.readOnly()));

  protected readonly showAvatarI18n = computed(() => this.toggleI18n('showAvatar', this.i18n().context_show_avatar()));
  protected readonly showNameI18n = computed(() => this.toggleI18n('showName', this.i18n().context_show_name()));
  protected readonly showMembersI18n = computed(() => this.toggleI18n('showMembers', this.i18n().context_show_member()));
  protected readonly showMembershipsI18n = computed(() => this.toggleI18n('showMemberships', this.i18n().context_show_membership()));
  protected readonly showResponsibilitiesI18n = computed(() => this.toggleI18n('showResponsibilities', this.i18n().context_show_responsibility()));
  protected readonly showPersonalRelsI18n = computed(() => this.toggleI18n('showPersonalRels', this.i18n().context_show_personal()));
  protected readonly showWorkRelsI18n = computed(() => this.toggleI18n('showWorkRels', this.i18n().context_show_workrel()));
  protected readonly saveChangesI18n = computed(() => this.toggleI18n('saveChanges', this.i18n().context_save()));

  protected onFieldChange(fieldName: ContextDiagramSwitch, fieldValue: boolean): void {
    this.dirty.emit(true);
    this.formData.update((vm) => ({ ...vm, [fieldName]: fieldValue }));
  }

  private toggleI18n(name: string, label: string): CheckboxI18n {
    return { name, label, helper: '' };
  }
}

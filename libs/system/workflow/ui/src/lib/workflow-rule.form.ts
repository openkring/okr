import { Component, computed, effect, input, model, output } from '@angular/core';
import { form } from '@angular/forms/signals';
import { IonCard, IonCardContent, IonCol, IonGrid, IonItem, IonNote, IonRow, IonSelect, IonSelectOption } from '@ionic/angular/standalone';

import { CategoryListModel, RoleName, UserModel, WorkflowRuleModel } from '@okr/shared-models';
import { CategorySelect, Chips, NotesInput, NotesInputI18n, NumberInput, NumberInputI18n, TextInput, TextInputI18n } from '@okr/shared-ui';
import { coerceBoolean, hasRole } from '@okr/shared-util-core';
import { validateVestTree } from '@okr/shared-util-angular';
import { DEFAULT_NOTES, DEFAULT_TAGS } from '@okr/shared-constants';

import { ResponsibilityOption, WRITE_BACK_OPTIONS, WorkflowI18n, actionNeedsArg, isApprovalAction, probeNeedsArg, workflowRuleValidations } from '@okr/system-workflow-util';

/**
 * Edit one workflow rule (spec 1.35): on this event, if this probe holds, open a task
 * for whoever holds this responsibility.
 *
 * `event`, `probe` and `action` come from DB categories (`workflow_event`,
 * `workflow_probe`), so the selectable set grows without a model change — but a NEW
 * probe name only works once the matching function is deployed in the probe registry.
 */
@Component({
  selector: 'okr-workflow-rule-form',
  standalone: true,
  imports: [
    TextInput, NumberInput, NotesInput, Chips, CategorySelect,
    IonGrid, IonRow, IonCol, IonCard, IonCardContent, IonItem, IonNote, IonSelect, IonSelectOption
  ],
  styles: [`
    @media (width <= 600px) { ion-card { margin: 5px;} }
    /* okr-cat-select renders a bare ion-button, so it carries no label of its own —
       this stands in for the floating label the ion-selects below it get for free. */
    .cat-label {
      display: block;
      padding-inline-start: 16px;
      font-size: 0.75rem;
      color: var(--ion-color-medium);
    }
  `],
  template: `
    @if (showForm()) {
      <form novalidate>

        <ion-card>
          <ion-card-content class="ion-no-padding">
            <ion-grid>
              <ion-row>
                <ion-col size="12">
                  <okr-text-input [i18n]="nameI18n()" [value]="name()" (valueChange)="onFieldChange('name', $event)"
                    [autofocus]="true" [maxLength]="50" [readOnly]="isReadOnly()" />
                </ion-col>
              </ion-row>
              <ion-row>
                <ion-col size="12">
                  <div class="cat-label">{{ i18n().event_label() }}</div>
                  <okr-cat-select [category]="eventCategory()" [selectedItemName]="event()"
                    (selectedItemNameChange)="onFieldChange('event', $event)" [readOnly]="isReadOnly()" />
                </ion-col>
              </ion-row>
              <ion-row>
                <ion-col size="12">
                  <div class="cat-label">{{ i18n().probe_label() }}</div>
                  <okr-cat-select [category]="probeCategory()" [selectedItemName]="probe()"
                    (selectedItemNameChange)="onFieldChange('probe', $event)" [readOnly]="isReadOnly()" />
                </ion-col>
              </ion-row>
              @if (needsProbeArg()) {
                <ion-row>
                  <ion-col size="12">
                    <okr-text-input [i18n]="probeArgI18n()" [value]="probeArg()" (valueChange)="onFieldChange('probeArg', $event)"
                      [maxLength]="30" [readOnly]="isReadOnly()" />
                  </ion-col>
                </ion-row>
              }
              <ion-row>
                <ion-col size="12">
                  <div class="cat-label">{{ i18n().action_label() }}</div>
                  <okr-cat-select [category]="actionCategory()" [selectedItemName]="action()"
                    (selectedItemNameChange)="onFieldChange('action', $event)" [readOnly]="isReadOnly()" />
                </ion-col>
              </ion-row>
              @if (needsActionArg()) {
                <ion-row>
                  <ion-col size="12">
                    <okr-text-input [i18n]="actionArgI18n()" [value]="actionArg()" (valueChange)="onFieldChange('actionArg', $event)"
                      [maxLength]="120" [readOnly]="isReadOnly()" />
                  </ion-col>
                </ion-row>
              }
              @if (isApproval()) {
                <ion-row>
                  <ion-col size="12">
                    <ion-item lines="none">
                      <ion-select [label]="i18n().writeBack_label()" labelPlacement="floating"
                        interface="popover" [disabled]="isReadOnly()" [value]="writeBack()"
                        (ionChange)="onFieldChange('writeBack', $event.detail.value)">
                        <ion-select-option value="">—</ion-select-option>
                        @for (option of writeBackOptions; track option) {
                          <ion-select-option [value]="option">{{ option }}</ion-select-option>
                        }
                      </ion-select>
                    </ion-item>
                    <ion-item lines="none">
                      <ion-note>{{ i18n().writeBack_helper() }}</ion-note>
                    </ion-item>
                  </ion-col>
                </ion-row>
              }
              <ion-row>
                <ion-col size="12">
                  <ion-item lines="none">
                    <ion-select [label]="i18n().responsibilityKey_label()" labelPlacement="floating"
                      interface="popover" [disabled]="isReadOnly()" [value]="responsibilityKey()"
                      (ionChange)="onFieldChange('responsibilityKey', $event.detail.value)">
                      @for (r of responsibilityOptions(); track r.key) {
                        <ion-select-option [value]="r.key">{{ r.name }}</ion-select-option>
                      }
                    </ion-select>
                  </ion-item>
                  <ion-item lines="none">
                    <ion-note>{{ i18n().responsibilityKey_helper() }}</ion-note>
                  </ion-item>
                </ion-col>
              </ion-row>
              <ion-row>
                <ion-col size="12">
                  <okr-text-input [i18n]="messageKeyI18n()" [value]="messageKey()"
                    (valueChange)="onFieldChange('messageKey', $event)" [maxLength]="80" [readOnly]="isReadOnly()" />
                </ion-col>
              </ion-row>
              <ion-row>
                <ion-col size="12">
                  <okr-number-input [i18n]="dueInDaysI18n()" [value]="dueInDays()"
                    (valueChange)="onNumberChange('dueInDays', $event)" [readOnly]="isReadOnly()"
                    [min]="0" [max]="365" />
                </ion-col>
              </ion-row>
            </ion-grid>
          </ion-card-content>
        </ion-card>

        <!-- guarded, always last -->
        @if (hasRole('admin')) {
          <okr-chips chipName="tag" [storedChips]="tags()" (storedChipsChange)="onFieldChange('tags', $event)"
            [allChips]="allTags()" [readOnly]="isReadOnly()" />
        }
        @if (hasRole('admin')) {
          <okr-notes-input [i18n]="notesI18n()" [value]="notes()" (valueChange)="onFieldChange('notes', $event)"
            [readOnly]="isReadOnly()" />
        }
      </form>
    }
  `
})
export class WorkflowRuleForm {
  // inputs. The two categories are passed IN rather than read from AppStore: a `type:ui`
  // lib may not depend on `type:feature`, and the store that opens the modal already has them.
  public readonly i18n = input.required<WorkflowI18n>();
  public readonly eventCategory = input.required<CategoryListModel>();
  public readonly probeCategory = input.required<CategoryListModel>();
  public readonly actionCategory = input.required<CategoryListModel>();
  public formData = model.required<WorkflowRuleModel>();
  public readonly currentUser = input<UserModel | undefined>();
  // {key: okey, name} of the tenant's responsibilities — resolved by the store, like the categories
  public readonly responsibilities = input<ResponsibilityOption[]>([]);
  public readonly allTags = input(DEFAULT_TAGS);
  public readonly readOnly = input(true);
  public readonly showForm = input(true);

  // outputs
  public readonly dirty = output<boolean>();
  public readonly valid = output<boolean>();

  // signal form — wraps formData with Vest validation
  protected readonly ruleForm = form(this.formData, (path) =>
    validateVestTree(path, workflowRuleValidations as any),
  );

  constructor() {
    effect(() => this.valid.emit(this.ruleForm().valid()));
  }

  // computed field accessors — legacy documents may miss a field, so coalesce
  protected readonly isReadOnly = computed(() => coerceBoolean(this.readOnly()));
  protected readonly name = computed(() => this.formData()?.name ?? '');
  protected readonly event = computed(() => this.formData()?.event ?? '');
  protected readonly probe = computed(() => this.formData()?.probe ?? '');
  protected readonly probeArg = computed(() => this.formData()?.probeArg ?? '');
  // only the probes that consume it (and do not carry an inline ':arg') show the field
  protected readonly needsProbeArg = computed(() => probeNeedsArg(this.probe()));
  protected readonly action = computed(() => this.formData()?.action ?? 'openTask');
  protected readonly actionArg = computed(() => this.formData()?.actionArg ?? '');
  // only the actions that consume it show the field — openTask has nothing to configure
  protected readonly needsActionArg = computed(() => actionNeedsArg(this.action()));
  // the outcome patch only means anything for an approval
  protected readonly isApproval = computed(() => isApprovalAction(this.action()));
  protected readonly writeBack = computed(() => this.formData()?.writeBack ?? '');
  protected readonly writeBackOptions = WRITE_BACK_OPTIONS;
  protected readonly responsibilityKey = computed(() => this.formData()?.responsibilityKey ?? '');
  // a rule may point at a responsibility that was deleted or is not loaded yet: keep the stored
  // key selectable, otherwise opening the rule would silently blank it on the next save
  protected readonly responsibilityOptions = computed(() => {
    const options = this.responsibilities();
    const key = this.responsibilityKey();
    return !key || options.some(o => o.key === key) ? options : [{ key, name: key }, ...options];
  });
  protected readonly messageKey = computed(() => this.formData()?.messageKey ?? '');
  protected readonly dueInDays = computed(() => this.formData()?.dueInDays ?? 0);
  protected readonly notes = computed(() => this.formData()?.notes ?? DEFAULT_NOTES);
  protected readonly tags = computed(() => this.formData()?.tags ?? DEFAULT_TAGS);

  protected nameI18n = computed(() => ({
    name: 'name',
    label: this.i18n().name_label(),
    placeholder: this.i18n().name_placeholder(),
    helper: this.i18n().name_helper()
  } as TextInputI18n));

  protected probeArgI18n = computed(() => ({
    name: 'probeArg',
    label: this.i18n().probeArg_label(),
    placeholder: this.i18n().probeArg_placeholder(),
    helper: this.i18n().probeArg_helper()
  } as TextInputI18n));

  protected actionArgI18n = computed(() => ({
    name: 'actionArg',
    label: this.i18n().actionArg_label(),
    placeholder: this.i18n().actionArg_placeholder(),
    helper: this.i18n().actionArg_helper()
  } as TextInputI18n));

  protected responsibilityKeyI18n = computed(() => ({
    name: 'responsibilityKey',
    label: this.i18n().responsibilityKey_label(),
    placeholder: this.i18n().responsibilityKey_placeholder(),
    helper: this.i18n().responsibilityKey_helper()
  } as TextInputI18n));

  protected messageKeyI18n = computed(() => ({
    name: 'messageKey',
    label: this.i18n().messageKey_label(),
    placeholder: this.i18n().messageKey_placeholder(),
    helper: this.i18n().messageKey_helper()
  } as TextInputI18n));

  protected dueInDaysI18n = computed(() => ({
    name: 'dueInDays',
    label: this.i18n().dueInDays_label(),
    placeholder: '',
    helper: this.i18n().dueInDays_helper()
  } as NumberInputI18n));

  protected notesI18n = computed(() => ({
    name: 'notes',
    label: this.i18n().notes_label(),
    placeholder: this.i18n().notes_placeholder()
  } as NotesInputI18n));

  protected onFieldChange(fieldName: string, fieldValue: string | string[]): void {
    this.dirty.emit(true);
    // switching to a probe that takes no argument drops the old one: an argument the form no
    // longer shows is data nobody can see, correct or explain.
    let dropped: Partial<WorkflowRuleModel> = {};
    if (fieldName === 'probe' && !probeNeedsArg(fieldValue as string)) dropped = { probeArg: '' };
    // same rule for the action: an argument the form no longer shows is data nobody can
    // see, correct or explain — and a stale writeBack would patch a record on an action
    // that never asks anyone.
    if (fieldName === 'action') {
      dropped = {
        ...(actionNeedsArg(fieldValue as string) ? {} : { actionArg: '' }),
        ...(isApprovalAction(fieldValue as string) ? {} : { writeBack: '' }),
      };
    }
    this.formData.update((vm) => ({ ...vm, [fieldName]: fieldValue, ...dropped }));
  }

  protected onNumberChange(fieldName: string, fieldValue: number): void {
    this.dirty.emit(true);
    this.formData.update((vm) => ({ ...vm, [fieldName]: fieldValue }));
  }

  protected hasRole(role: RoleName): boolean {
    return hasRole(role, this.currentUser());
  }
}

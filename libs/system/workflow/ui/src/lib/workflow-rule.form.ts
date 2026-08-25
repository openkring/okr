import { Component, computed, effect, input, model, output, signal } from '@angular/core';
import { AsyncPipe } from '@angular/common';
import { form } from '@angular/forms/signals';
import { IonButton, IonCard, IonCardContent, IonCol, IonGrid, IonIcon, IonItem, IonLabel, IonNote, IonReorder, IonReorderGroup, IonRow, IonSelect, IonSelectOption, ItemReorderEventDetail } from '@ionic/angular/standalone';

import { TranslatePipe } from '@okr/shared-i18n';
import { CategoryListModel, RoleName, UserModel, WorkflowActionStep, WorkflowRuleModel } from '@okr/shared-models';
import { SvgIconPipe } from '@okr/shared-pipes';
import { CategorySelect, Chips, NotesInput, NotesInputI18n, NumberInput, NumberInputI18n, TextInput, TextInputI18n } from '@okr/shared-ui';
import { coerceBoolean, getItemLabel, hasRole } from '@okr/shared-util-core';
import { validateVestTree } from '@okr/shared-util-angular';
import { DEFAULT_NOTES, DEFAULT_TAGS } from '@okr/shared-constants';

import { ResponsibilityOption, WRITE_BACK_OPTIONS, WorkflowI18n, actionNeedsArg, addWorkflowStep, getWorkflowStepSummary, getWorkflowSteps, isApprovalAction, isWorkflowStepComplete, patchWorkflowStep, probeNeedsArg, removeWorkflowStep, setWorkflowStepAction, workflowRuleValidations } from '@okr/system-workflow-util';

/**
 * Edit one workflow rule (spec 1.35): on this event, if this probe holds, do this to whoever
 * holds this responsibility.
 *
 * The rule is split into two parts, because that is what the model says: the trigger card
 * (event, probe, responsibility — one per rule) and the ACTION STEPS below it, one card each,
 * collapsed to a single line until you open one. A rule has always had several consequences in
 * the field ('tell the treasurer AND start a chat'); before the steps editor an admin had to
 * express that as two rules with a duplicated trigger and no visible order.
 *
 * `event`, `probe` and `action` come from DB categories (`workflow_event`, `workflow_probe`,
 * `workflow_action`), so the selectable set grows without a model change — but a NEW probe name
 * only works once the matching function is deployed in the probe registry.
 */
@Component({
  selector: 'okr-workflow-rule-form',
  standalone: true,
  imports: [
    AsyncPipe, TranslatePipe, SvgIconPipe,
    TextInput, NumberInput, NotesInput, Chips, CategorySelect,
    IonGrid, IonRow, IonCol, IonCard, IonCardContent, IonItem, IonLabel, IonNote, IonSelect, IonSelectOption,
    IonButton, IonIcon, IonReorder, IonReorderGroup
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
    .section-label {
      display: flex;
      align-items: baseline;
      gap: 8px;
      padding: 16px 16px 0 16px;
      font-size: 0.75rem;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: var(--ion-color-secondary);
    }
    .section-helper { padding: 2px 16px 0 16px; font-size: 0.8rem; color: var(--ion-color-medium); }
    /* the collapsed step header: one tap target for the whole row */
    .step-header { cursor: pointer; }
    .step-no {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-width: 24px;
      height: 24px;
      border-radius: 12px;
      background: var(--ion-color-secondary);
      color: var(--ion-color-secondary-contrast);
      font-size: 0.75rem;
      font-weight: 600;
    }
    .step-body { border-top: 1px solid rgba(0, 0, 0, 0.09); }
    ion-card.step { margin-top: 8px; margin-bottom: 8px; }
  `],
  template: `
    @if (showForm()) {
      <form novalidate>

        <!-- ---------------------------- the trigger ---------------------------- -->
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
                <ion-col size="12" size-md="6">
                  <div class="cat-label">{{ i18n().event_label() }}</div>
                  <okr-cat-select [category]="eventCategory()" [selectedItemName]="event()"
                    (selectedItemNameChange)="onFieldChange('event', $event)" [readOnly]="isReadOnly()" />
                </ion-col>
                <ion-col size="12" size-md="6">
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
            </ion-grid>
          </ion-card-content>
        </ion-card>

        <!-- ---------------------------- the action steps ---------------------------- -->
        <div class="section-label">
          <span>{{ i18n().steps_label() }}</span>
          <span>{{ steps().length }}</span>
        </div>
        <div class="section-helper">{{ i18n().steps_helper() }}</div>

        <!-- Casting $event to $any is a temporary fix for this bug https://github.com/ionic-team/ionic-framework/issues/24245 -->
        <ion-reorder-group [disabled]="isReadOnly()" (ionItemReorder)="onReorder($any($event))">
          @for (row of stepRows(); track $index) {
            <ion-card class="step">
              <ion-card-content class="ion-no-padding">

                <ion-item lines="none" class="step-header" (click)="toggleStep(row.index)">
                  <ion-reorder slot="start" />
                  <ion-label>
                    <h3><span class="step-no">{{ row.index + 1 }}</span>&nbsp; {{ row.actionLabel | translate | async }}</h3>
                    <p>{{ row.summary }}</p>
                  </ion-label>
                  @if (!row.isComplete) {
                    <ion-icon slot="end" color="danger" [title]="i18n().steps_incomplete()" src="{{ 'alert-circle' | svgIcon }}" />
                  }
                  @if (!isReadOnly() && steps().length > 1) {
                    <ion-button slot="end" fill="clear" color="danger" [title]="i18n().steps_remove()"
                      (click)="removeStep(row.index, $event)">
                      <ion-icon slot="icon-only" src="{{ 'trash' | svgIcon }}" />
                    </ion-button>
                  }
                  <ion-icon slot="end" src="{{ (row.isExpanded ? 'chevron-up' : 'chevron-down') | svgIcon }}" />
                </ion-item>

                @if (row.isExpanded) {
                  <ion-grid class="step-body">
                    <ion-row>
                      <ion-col size="12">
                        <div class="cat-label">{{ i18n().action_label() }}</div>
                        <okr-cat-select [category]="actionCategory()" [selectedItemName]="row.step.action"
                          (selectedItemNameChange)="onActionChange(row.index, $event)" [readOnly]="isReadOnly()" />
                      </ion-col>
                    </ion-row>
                    @if (row.needsArg) {
                      <ion-row>
                        <ion-col size="12">
                          <okr-text-input [i18n]="actionArgI18n()" [value]="row.step.actionArg"
                            (valueChange)="onStepFieldChange(row.index, 'actionArg', $event)"
                            [maxLength]="120" [readOnly]="isReadOnly()" />
                        </ion-col>
                      </ion-row>
                    }
                    @if (row.isApproval) {
                      <ion-row>
                        <ion-col size="12">
                          <ion-item lines="none">
                            <ion-select [label]="i18n().writeBack_label()" labelPlacement="floating"
                              interface="popover" [disabled]="isReadOnly()" [value]="row.step.writeBack"
                              (ionChange)="onStepFieldChange(row.index, 'writeBack', $event.detail.value)">
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
                        <okr-text-input [i18n]="messageKeyI18n()" [value]="row.step.messageKey"
                          (valueChange)="onStepFieldChange(row.index, 'messageKey', $event)"
                          [maxLength]="80" [readOnly]="isReadOnly()" />
                      </ion-col>
                    </ion-row>
                    @if (row.needsDueInDays) {
                      <ion-row>
                        <ion-col size="12">
                          <okr-number-input [i18n]="dueInDaysI18n()" [value]="row.step.dueInDays"
                            (valueChange)="onStepNumberChange(row.index, 'dueInDays', $event)" [readOnly]="isReadOnly()"
                            [min]="0" [max]="365" />
                        </ion-col>
                      </ion-row>
                    }
                  </ion-grid>
                }
              </ion-card-content>
            </ion-card>
          }
        </ion-reorder-group>

        @if (!isReadOnly()) {
          <ion-button fill="clear" expand="block" (click)="addStep()">
            <ion-icon slot="start" src="{{ 'add-circle' | svgIcon }}" />
            {{ i18n().steps_add() }}
          </ion-button>
        }

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
  // inputs. The three categories are passed IN rather than read from AppStore: a `type:ui`
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
  protected readonly responsibilityKey = computed(() => this.formData()?.responsibilityKey ?? '');
  // a rule may point at a responsibility that was deleted or is not loaded yet: keep the stored
  // key selectable, otherwise opening the rule would silently blank it on the next save
  protected readonly responsibilityOptions = computed(() => {
    const options = this.responsibilities();
    const key = this.responsibilityKey();
    return !key || options.some(o => o.key === key) ? options : [{ key, name: key }, ...options];
  });
  protected readonly notes = computed(() => this.formData()?.notes ?? DEFAULT_NOTES);
  protected readonly tags = computed(() => this.formData()?.tags ?? DEFAULT_TAGS);
  protected readonly writeBackOptions = WRITE_BACK_OPTIONS;

  /*------------------------------ the steps ------------------------------*/
  // a legacy document written before the model grew `steps[]` still opens: it gets one step
  protected readonly steps = computed(() => getWorkflowSteps(this.formData()?.steps));
  /** Which step is open. Only one at a time — three open steps are a scrolling exercise. */
  private readonly expandedStep = signal(0);

  protected readonly stepRows = computed(() => {
    const expanded = this.expandedStep();
    const category = this.actionCategory();
    return this.steps().map((step, index) => ({
      index,
      step,
      // the action's translated label; a data-driven key, so TranslatePipe is the right tool
      actionLabel: getItemLabel(category, step.action),
      summary: getWorkflowStepSummary(step),
      isComplete: isWorkflowStepComplete(step),
      isExpanded: index === expanded,
      needsArg: actionNeedsArg(step.action),
      needsDueInDays: step.action === 'openTask',
      isApproval: isApprovalAction(step.action),
    }));
  });

  protected toggleStep(index: number): void {
    this.expandedStep.update((current) => (current === index ? -1 : index));
  }

  protected addStep(): void {
    this.patchRule({ steps: addWorkflowStep(this.formData()?.steps) });
    // open what was just added — an unconfigured step is never what the admin wanted to leave
    this.expandedStep.set(this.steps().length - 1);
  }

  protected removeStep(index: number, event: Event): void {
    // the row itself toggles the step; deleting must not also open the next one
    event.stopPropagation();
    this.patchRule({ steps: removeWorkflowStep(this.formData()?.steps, index) });
    this.expandedStep.set(-1);
  }

  /**
   * Finish a drag and reposition the step. The steps run in array order, so this is the order
   * of the consequences, not decoration.
   */
  protected onReorder(event: CustomEvent<ItemReorderEventDetail>): void {
    this.patchRule({ steps: event.detail.complete([...this.steps()]) as WorkflowActionStep[] });
    this.expandedStep.set(-1);
  }

  protected onActionChange(index: number, action: string): void {
    this.patchRule({ steps: setWorkflowStepAction(this.formData()?.steps, index, action) });
  }

  protected onStepFieldChange(index: number, fieldName: keyof WorkflowActionStep, fieldValue: string): void {
    this.patchRule({ steps: patchWorkflowStep(this.formData()?.steps, index, { [fieldName]: fieldValue }) });
  }

  protected onStepNumberChange(index: number, fieldName: keyof WorkflowActionStep, fieldValue: number): void {
    this.patchRule({ steps: patchWorkflowStep(this.formData()?.steps, index, { [fieldName]: fieldValue }) });
  }

  /*------------------------------ the rule ------------------------------*/
  protected onFieldChange(fieldName: string, fieldValue: string | string[]): void {
    // switching to a probe that takes no argument drops the old one: an argument the form no
    // longer shows is data nobody can see, correct or explain.
    const dropped: Partial<WorkflowRuleModel> =
      fieldName === 'probe' && !probeNeedsArg(fieldValue as string) ? { probeArg: '' } : {};
    this.patchRule({ [fieldName]: fieldValue, ...dropped });
  }

  private patchRule(patch: Partial<WorkflowRuleModel>): void {
    this.dirty.emit(true);
    this.formData.update((vm) => ({ ...vm, ...patch }));
  }

  /*------------------------------ i18n ------------------------------*/
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

  protected hasRole(role: RoleName): boolean {
    return hasRole(role, this.currentUser());
  }
}

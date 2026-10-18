import { Component, computed, inject, input, linkedSignal, resource, signal } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { catchError, of, switchMap } from 'rxjs';
import { IonAccordionGroup, IonButton, IonContent, IonItem, IonLabel, ModalController } from '@ionic/angular';

import { I18nService } from '@okr/shared-i18n';
import { ApprovalModelName, CategoryListModel, ProjectModel, TaskModel, TaskModelName, UserModel } from '@okr/shared-models';
import { ChangeConfirmation, ChangeConfirmationI18n, Header } from '@okr/shared-ui';
import { coerceBoolean, hasRole, newAvatarInfo, safeStructuredClone, warn } from '@okr/shared-util-core';

import { CommentsAccordion } from '@okr/comment-feature';
import { TaskForm } from '@okr/project-task-ui';
import { AvatarSelect } from '@okr/avatar-ui';
import { AlertService, dismissOverlay, navigateByUrl, resourceParams } from '@okr/shared-util-angular';
import { ApprovalService } from '@okr/system-workflow-data-access';
import { ApprovalDecisionCard } from '@okr/system-workflow-ui';
import { WORKFLOW_I18N_KEYS, WorkflowI18n, canDecideApproval, canWithdrawApproval } from '@okr/system-workflow-util';

import { MembershipService } from '@okr/relationship-membership-data-access';
import { ExitSettlementCard } from '@okr/relationship-membership-ui';
import {
  chfRappen, choiceConfirmText, EXIT_SETTLEMENT_I18N_KEYS, EXIT_SETTLEMENT_TAG, ExitSettlementI18n, fillExitText, SettlementChoice, settleErrorText,
} from '@okr/relationship-membership-util';

import { TaskStore } from './task.store';

@Component({
  selector: 'okr-task-edit-modal',
  standalone: true,
  imports: [
    Header, ChangeConfirmation, TaskForm, CommentsAccordion,
    AvatarSelect, ApprovalDecisionCard, ExitSettlementCard,
    IonContent, IonAccordionGroup, IonButton, IonItem, IonLabel
  ],
  providers: [TaskStore],
  template: `
    <!-- the advanced-settings toggle lives in the toolbar, left of the close button -->
    <okr-header [i18n]="{ title: headerTitle() }" [isModal]="true"
      actionIcon="toggle" [actionTitle]="store.i18n.form_advanced_label()"
      (actionClicked)="showAdvanced.set(!showAdvanced())" />
    @if(showConfirmation()) {
      <okr-change-confirmation [i18n]="changeConfirmationI18n()" (cancelClicked)="cancel()" (saveClicked)="save()" />
    }
    <ion-content class="ion-no-padding">
      @if(approval(); as approval) {
        <okr-approval-decision-card [approval]="approval" [i18n]="workflowI18n"
          [canDecide]="canDecide()" [canWithdraw]="canWithdraw()" (decided)="onDecided($event)" />
      }
      @if(showSettlement()) {
        @if(settlementPreview(); as preview) {
          <okr-exit-settlement-card [settlement]="preview.settlement" [i18n]="exitI18n" [done]="preview.done"
            [decision]="preview.decision ?? ''" [busy]="settleBusy()" (chosen)="onChosen($event)" />
        }
      }
      @if(formData(); as formData) {
        <okr-task-form
          [i18n]="store.i18n"
          [formData]="formData"
          (formDataChange)="onFormDataChange($event)"
          [currentUser]="currentUser()"
          [showForm]="showForm()"
          [allTags]="tags()"
          [tenantId]="tenantId()"
          [states]="states()"
          [priorities]="priorities()"
          [importances]="importances()"
          [projects]="projects()"
          [readOnly]="isReadOnly()"
          [(showAdvanced)]="showAdvanced"
          (dirty)="formDirty.set($event)"
          (valid)="formValid.set($event)"
          (relatedClicked)="openRelated($event)"
        />
      }

      @if(showAdvanced()) {
        <okr-avatar-select
          name="assignee"
          [title]="store.i18n.assignee()"
          [note]="store.i18n.assignee_description()"
          [avatar]="assignee()"
          [readOnly]="isReadOnly()"
          (selectClicked)="selectPerson('assignee')"
        />

        <okr-avatar-select
          name="author"
          [title]="store.i18n.author()"
          [note]="store.i18n.author_description()"
          [avatar]="author()"
          [readOnly]="isReadOnly() || !canPickAuthor()"
          (selectClicked)="selectPerson('author')"
          />

        @if (!isMeetingTask()) {
          <ion-item lines="none">
            <ion-label>
              <h3>{{ store.i18n.shareGroupLabel() }}</h3>
              <p>{{ shareGroupName() || store.i18n.shareGroupNone() }}</p>
            </ion-label>
            @if (!isReadOnly()) {
              <ion-button slot="end" fill="clear" (click)="selectShareGroup()">{{ store.i18n.shareGroupSelect() }}</ion-button>
              @if (formData()?.shareKey) {
                <ion-button slot="end" fill="clear" (click)="onFieldChange('shareKey', '')">{{ store.i18n.shareGroupClear() }}</ion-button>
              }
            }
          </ion-item>
        }
      }

      <!-- Commenting is NOT part of editing the task: a viewer may always answer a
           Schadenmeldung, so the accordion is open and its add button enabled even in
           view mode ([readOnly]=false, independent of the form's own readOnly). -->
      <!-- a new task has no okey yet: comments would attach to the dangling key 'task.' -->
      @if(!isNew()) {
        <ion-accordion-group value="comments">
          <okr-comments-accordion [parentKey]="parentKey()" [readOnly]="false" />
        </ion-accordion-group>
      }
    </ion-content>
  `
})
export class TaskEditModal {
  private readonly modalController = inject(ModalController);
  private readonly router = inject(Router);
  protected readonly store = inject(TaskStore);
  private readonly approvalService = inject(ApprovalService);
  private readonly alertService = inject(AlertService);
  private readonly membershipService = inject(MembershipService);
  protected readonly exitI18n = inject(I18nService).translateAll(EXIT_SETTLEMENT_I18N_KEYS) as ExitSettlementI18n;
  protected readonly workflowI18n = inject(I18nService).translateAll(WORKFLOW_I18N_KEYS) as WorkflowI18n;

  // inputs
  public task = input.required<TaskModel>();
  public currentUser = input<UserModel | undefined>();
  public readonly tags = input.required<string>();
  public readonly tenantId = input.required<string>();
  public readonly states = input.required<CategoryListModel>();
  public readonly priorities = input.required<CategoryListModel>();
  public readonly importances = input.required<CategoryListModel>();
  public readonly projects = input<ProjectModel[]>([]);
  public readOnly = input(true);
  protected isReadOnly = computed(() => coerceBoolean(this.readOnly()));
  
  // signals
  protected formDirty = signal(false);
  protected formValid = signal(false);
  public formData = linkedSignal(() => safeStructuredClone(this.task()));
  protected showForm = signal(true);
  protected isNew = computed(() => (this.task().okey ?? '').length === 0);
  // shared with the form; drives name, author + share group here. A new task opens expanded: the
  // simplified view shows the name only as a title, so an empty new task could not be named.
  protected showAdvanced = linkedSignal(() => this.isNew());

  // derived
  protected headerTitle = computed(() => this.store.getTitleLabel(this.isReadOnly(), this.task().okey, ));
  protected readonly parentKey = computed(() => `${TaskModelName}.${this.task().okey}`);
  protected readonly isMeetingTask = computed(() => (this.formData()?.relatedKey ?? '').startsWith('meeting.'));
  protected readonly shareGroupName = computed(() => {
    const key = this.formData()?.shareKey ?? '';
    return key ? (this.store.appStore.getGroup(key)?.name ?? key) : '';
  });
  // no fallback to the current user: an empty author/assignee must look empty, since that is what is saved
  protected author = computed(() => this.formData()?.author);
  protected assignee = computed(() => this.formData()?.assignee);
  // The create rule denies setting an author other than yourself unless privileged (spec 1.72
  // §4); the author picker must not offer what the rules would reject. `hasRole('privileged', …)`
  // also covers admin (see auth.util.ts).
  protected canPickAuthor = computed(() => hasRole('privileged', this.currentUser()));
  protected showConfirmation = computed(() => this.formValid() && this.formDirty());
  protected readonly changeConfirmationI18n = computed(() => ({ cancel: this.store.i18n.cancel(), save: this.store.i18n.save()} as ChangeConfirmationI18n));

  /** spec 1.88 §5.7 — the approval this task was opened for, if any */
  protected readonly approvalKey = computed(() => {
    const rk = this.task().relatedKey ?? '';
    return rk.startsWith(`${ApprovalModelName}.`) ? rk.slice(ApprovalModelName.length + 1) : '';
  });
  protected readonly approval = toSignal(
    toObservable(this.approvalKey).pipe(switchMap((key) => (key ? this.approvalService.read(key).pipe(catchError(() => of(undefined))) : of(undefined)))),
  );
  /** spec 1.105 — the treasurer task of an exit settlement; the card is for treasurers only (admin passes) */
  protected readonly isExitSettlement = computed(() =>
    (this.task().relatedKey ?? '').startsWith('membership.') && (this.task().tags ?? '').split(',').map((t) => t.trim()).includes(EXIT_SETTLEMENT_TAG));
  protected readonly showSettlement = computed(() => this.isExitSettlement() && !this.isNew() && hasRole('treasurer', this.currentUser()));
  protected readonly settleBusy = signal(false);
  protected readonly settlementPreview = resource({
    params: resourceParams(() => (this.showSettlement() ? this.task().okey : '')),
    loader: async ({ params }) => {
      if (!params) return undefined;
      try {
        return await this.membershipService.settleExit(params, 'preview');
      } catch (error) {
        // never swallow: without the figures the treasurer would decide blind
        warn('TaskEditModal.settlementPreview: ' + error);
        this.alertService.error(this.settleError(error));
        return undefined;
      }
    },
  }).value;
  private readonly myPersonKey = computed(() => this.currentUser()?.personKey ?? '');
  private readonly isAdmin = computed(() => hasRole('admin', this.currentUser()));
  protected readonly canDecide = computed(() => {
    const a = this.approval();
    return !!a && canDecideApproval(a, this.myPersonKey(), this.isAdmin());
  });
  protected readonly canWithdraw = computed(() => {
    const a = this.approval();
    return !!a && canWithdrawApproval(a, this.myPersonKey(), this.isAdmin());
  });

 /******************************* actions *************************************** */
  public async save(): Promise<void> {
    await dismissOverlay(this.modalController, this.formData(), 'confirm');  
  }

  /** Leave the modal for the record this task was opened for (its `relatedKey` back-link). */
  protected async openRelated(url: string): Promise<void> {
    if (!url) return;
    await dismissOverlay(this.modalController);
    await navigateByUrl(this.router, url);
  }

  /** decideApproval sets the task done server-side; this modal never saves the task for a decision. */
  protected async onDecided(d: { decision: 'approve' | 'reject' | 'withdraw'; note: string }): Promise<void> {
    const key = this.approvalKey();
    if (!key) return;
    try {
      await this.approvalService.decide(key, d.decision, d.note);
      await dismissOverlay(this.modalController);
    } catch (error) {
      // never swallow: a failed decision would look like a successful one
      warn('TaskEditModal.onDecided: ' + error);
      this.alertService.error(`${this.workflowI18n.approval_decided_error()} ${error instanceof Error ? error.message : ''}`);
    }
  }

  /** Confirm, run the chosen settlement on the server (it closes the task) and leave the modal. */
  protected async onChosen(choice: SettlementChoice): Promise<void> {
    const key = this.task().okey;
    const settlement = this.settlementPreview()?.settlement;
    if (!key || !settlement || this.settleBusy()) return;
    const text = fillExitText(choiceConfirmText(this.exitI18n, choice), { amount: chfRappen(settlement.refundRappen), year: settlement.exitYear });
    if (!(await this.alertService.confirm(text, true))) return;
    this.settleBusy.set(true);
    try {
      const result = await this.membershipService.settleExit(key, choice);
      await this.alertService.showToast(result.decision || this.exitI18n.done_toast());
      await dismissOverlay(this.modalController);
    } catch (error) {
      // never swallow: a failed settlement would look like a successful one
      warn('TaskEditModal.onChosen: ' + error);
      this.alertService.error(this.settleError(error));
    } finally {
      this.settleBusy.set(false);
    }
  }

  private settleError(error: unknown): string {
    const reason = (error as { details?: { reason?: string } })?.details?.reason;
    // never an empty toast: the scoped bundle may not be loaded yet
    return settleErrorText(this.exitI18n, reason) || 'Das hat nicht geklappt. Bitte versuche es später noch einmal.';
  }

  public async cancel(): Promise<void> {
    this.formDirty.set(false);
    this.formData.set(safeStructuredClone(this.task()));  // reset the form
    // re-mount the form so its field state (touched, error notes) starts fresh
    this.showForm.set(false);
    setTimeout(() => this.showForm.set(true), 0);
  }

  protected onFieldChange(fieldName: string, fieldValue: string | string[] | number | boolean): void {
    this.formDirty.set(true);
    this.formData.update((vm: TaskModel | undefined) => {
      if (!vm) return vm;
      return { ...vm, [fieldName]: fieldValue };
    });      
  }

  protected onFormDataChange(formData: TaskModel): void {
    this.formData.set(formData);
  }

  protected async selectShareGroup(): Promise<void> {
    const group = await this.store.selectGroup();
    if (group) this.onFieldChange('shareKey', group.okey);
  }

  protected async selectPerson(type: 'author' | 'assignee'): Promise<void> {
    const person = await this.store.selectPerson();
    if (!person) return;
    const avatar = newAvatarInfo(person.okey, person.firstName, person.lastName, 'person', person.gender, '', '');
    this.formData.update((vm) => {
      if (!vm) return vm;
      return ({...vm, [type]: avatar });
    });      
    this.formDirty.set(true);
  }
}

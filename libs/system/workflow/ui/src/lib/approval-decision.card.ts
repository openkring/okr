import { Component, computed, input, output, signal } from '@angular/core';
import { IonButton, IonCard, IonCardContent, IonCol, IonGrid, IonItem, IonLabel, IonNote, IonRow } from '@ionic/angular/standalone';

import { ApprovalModel, MAX_DECISION_NOTE_LENGTH } from '@okr/shared-models';
import { NotesInput, NotesInputI18n } from '@okr/shared-ui';
import { coerceBoolean } from '@okr/shared-util-core';

import { WorkflowI18n, approvalStateColor, deciderName } from '@okr/system-workflow-util';

/**
 * The decision UI of one approval (spec 2026-08-15-approval-workflow-spec.md §3.5): the facts
 * of the approval, the note, and the approve / reject / withdraw buttons.
 *
 * NOT a `building-forms` edit modal, and deliberately so: an approval carries no editable
 * fields. The only input is the note, and the buttons hold the decisions instead of a
 * change-confirmation — a decision is not a save, and offering "save" for it would suggest
 * the record can be changed back.
 *
 * The card only emits `decided`; the host (modal or page) performs the decision.
 */
@Component({
  selector: 'okr-approval-decision-card',
  standalone: true,
  imports: [NotesInput, IonCard, IonCardContent, IonGrid, IonRow, IonCol, IonItem, IonLabel, IonNote, IonButton],
  styles: [`
    @media (width <= 600px) { ion-card { margin: 5px; } }
    .decisions { display: flex; gap: 8px; padding: 8px 16px 16px; }
    .decisions ion-button { flex: 1; }
  `],
  template: `
    <ion-card>
      <ion-card-content class="ion-no-padding">
        <ion-grid>
          <ion-row>
            <ion-col size="12" size-md="6">
              <ion-item lines="none">
                <ion-label>
                  <p>{{ i18n().approval_subject_label() }}</p>
                  <h3>{{ subjectName() }}</h3>
                </ion-label>
              </ion-item>
            </ion-col>
            <ion-col size="12" size-md="6">
              <ion-item lines="none">
                <ion-label>
                  <p>{{ i18n().approval_kind_label() }}</p>
                  <h3>{{ kind() }}</h3>
                </ion-label>
              </ion-item>
            </ion-col>
          </ion-row>
          <ion-row>
            <ion-col size="12" size-md="6">
              <ion-item lines="none">
                <ion-label>
                  <p>{{ i18n().approval_requester_label() }}</p>
                  <h3>{{ requesterName() }}</h3>
                </ion-label>
              </ion-item>
            </ion-col>
            <ion-col size="12" size-md="6">
              <ion-item lines="none">
                <ion-label>
                  <p>{{ i18n().approval_state_label() }}</p>
                  <h3 [style.color]="'var(--ion-color-' + stateColor() + ')'">{{ state() }}</h3>
                </ion-label>
              </ion-item>
            </ion-col>
          </ion-row>
          @if (isDecided()) {
            <ion-row>
              <ion-col size="12">
                <ion-item lines="none">
                  <ion-label>
                    <p>{{ i18n().approval_decisionDate_label() }} · {{ decider() }}</p>
                    <h3>{{ decisionDate() }}</h3>
                    @if (decisionNote()) { <ion-note>{{ decisionNote() }}</ion-note> }
                  </ion-label>
                </ion-item>
              </ion-col>
            </ion-row>
          }
        </ion-grid>
      </ion-card-content>
    </ion-card>

    @if (isDecidable()) {
      <okr-notes-input [i18n]="noteI18n()" [value]="note()" (valueChange)="note.set($event)" [readOnly]="false" />
      <div class="decisions">
        <ion-button color="success" (click)="decide('approve')">{{ i18n().approval_approve() }}</ion-button>
        <!-- reject needs a reason: an approval refused without one cannot be explained later -->
        <ion-button color="danger" [disabled]="note().trim().length === 0" (click)="decide('reject')">
          {{ i18n().approval_reject() }}
        </ion-button>
      </div>
    }
    @if (isWithdrawable()) {
      <div class="decisions">
        <ion-button fill="outline" color="medium" (click)="decide('withdraw')">{{ i18n().approval_withdraw() }}</ion-button>
      </div>
    }
  `
})
export class ApprovalDecisionCard {
  // inputs
  public readonly approval = input.required<ApprovalModel>();
  public readonly i18n = input.required<WorkflowI18n>();
  public readonly canDecide = input(false);
  public readonly canWithdraw = input(false);

  // outputs
  public readonly decided = output<{ decision: 'approve' | 'reject' | 'withdraw'; note: string }>();

  // state
  protected readonly note = signal('');

  // derived — legacy documents may miss a field, so coalesce
  protected readonly isDecidable = computed(() => coerceBoolean(this.canDecide()));
  protected readonly isWithdrawable = computed(() => coerceBoolean(this.canWithdraw()));
  protected readonly subjectName = computed(() => this.approval()?.subjectName ?? this.approval()?.subjectKey ?? '');
  protected readonly kind = computed(() => this.approval()?.kind ?? '');
  protected readonly state = computed(() => this.approval()?.state ?? 'pending');
  protected readonly stateColor = computed(() => approvalStateColor(this.state()));
  protected readonly isDecided = computed(() => this.state() !== 'pending');
  protected readonly decisionDate = computed(() => this.approval()?.decisionDate ?? '');
  protected readonly decisionNote = computed(() => this.approval()?.decisionNote ?? '');
  protected readonly requesterName = computed(() => avatarName(this.approval()?.requestedBy));
  protected readonly decider = computed(() => deciderName(this.approval()));

  protected readonly noteI18n = computed(() => ({
    name: 'note',
    label: this.i18n().approval_note_label(),
    placeholder: this.i18n().approval_note_placeholder(),
    helper: this.i18n().approval_note_helper(),
    maxLength: MAX_DECISION_NOTE_LENGTH,
  } as NotesInputI18n));

  /******************************* actions *************************************** */
  protected decide(decision: 'approve' | 'reject' | 'withdraw'): void {
    this.decided.emit({ decision, note: this.note().trim() });
  }
}

function avatarName(avatar: { name1?: string; name2?: string } | undefined): string {
  return `${avatar?.name1 ?? ''} ${avatar?.name2 ?? ''}`.trim();
}

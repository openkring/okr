import { Component, computed, inject, input, signal } from '@angular/core';
import { IonButton, IonCard, IonCardContent, IonCol, IonGrid, IonItem, IonLabel, IonNote, IonRow, IonContent, ModalController } from '@ionic/angular/standalone';

import { I18nService } from '@okr/shared-i18n';
import { ApprovalModel, MAX_DECISION_NOTE_LENGTH } from '@okr/shared-models';
import { Header, NotesInput, NotesInputI18n } from '@okr/shared-ui';
import { coerceBoolean } from '@okr/shared-util-core';

import { WORKFLOW_I18N_KEYS, WorkflowI18n, approvalStateColor } from '@okr/system-workflow-util';
import { dismissOverlay } from '@okr/shared-util-angular';

/**
 * Decide one approval (spec 2026-08-15-approval-workflow-spec.md §3.5).
 *
 * NOT a `building-forms` edit modal, and deliberately so: an approval carries no editable
 * fields. The only input is the note, and the footer holds the two decisions instead of a
 * change-confirmation — a decision is not a save, and offering "save" for it would suggest
 * the record can be changed back.
 */
@Component({
  selector: 'okr-approval-decide-modal',
  standalone: true,
  imports: [
    Header, NotesInput,
    IonContent, IonCard, IonCardContent, IonGrid, IonRow, IonCol, IonItem, IonLabel, IonNote, IonButton
  ],
  styles: [`
    @media (width <= 600px) { ion-card { margin: 5px; } }
    .decisions { display: flex; gap: 8px; padding: 8px 16px 16px; }
    .decisions ion-button { flex: 1; }
  `],
  template: `
    <okr-header [i18n]="{ title: i18n.approval_decide_label() }" [isModal]="true" />
    <ion-content class="ion-no-padding">
      <ion-card>
        <ion-card-content class="ion-no-padding">
          <ion-grid>
            <ion-row>
              <ion-col size="12" size-md="6">
                <ion-item lines="none">
                  <ion-label>
                    <p>{{ i18n.approval_subject_label() }}</p>
                    <h3>{{ subjectName() }}</h3>
                  </ion-label>
                </ion-item>
              </ion-col>
              <ion-col size="12" size-md="6">
                <ion-item lines="none">
                  <ion-label>
                    <p>{{ i18n.approval_kind_label() }}</p>
                    <h3>{{ kind() }}</h3>
                  </ion-label>
                </ion-item>
              </ion-col>
            </ion-row>
            <ion-row>
              <ion-col size="12" size-md="6">
                <ion-item lines="none">
                  <ion-label>
                    <p>{{ i18n.approval_requester_label() }}</p>
                    <h3>{{ requesterName() }}</h3>
                  </ion-label>
                </ion-item>
              </ion-col>
              <ion-col size="12" size-md="6">
                <ion-item lines="none">
                  <ion-label>
                    <p>{{ i18n.approval_state_label() }}</p>
                    <h3 [style.color]="'var(--ion-color-' + stateColor() + ')'">{{ state() }}</h3>
                  </ion-label>
                </ion-item>
              </ion-col>
            </ion-row>
            @if (decided()) {
              <ion-row>
                <ion-col size="12">
                  <ion-item lines="none">
                    <ion-label>
                      <p>{{ i18n.approval_decisionDate_label() }} · {{ approverName() }}</p>
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

      @if (!isReadOnly()) {
        <okr-notes-input [i18n]="noteI18n()" [value]="note()" (valueChange)="note.set($event)" [readOnly]="false" />
        <div class="decisions">
          <ion-button color="success" (click)="decide('approve')">{{ i18n.approval_approve() }}</ion-button>
          <!-- reject needs a reason: an approval refused without one cannot be explained later -->
          <ion-button color="danger" [disabled]="note().trim().length === 0" (click)="decide('reject')">
            {{ i18n.approval_reject() }}
          </ion-button>
        </div>
      }
      @if (canWithdraw()) {
        <div class="decisions">
          <ion-button fill="outline" color="medium" (click)="decide('withdraw')">{{ i18n.approval_withdraw() }}</ion-button>
        </div>
      }
    </ion-content>
  `
})
export class ApprovalDecideModal {
  private readonly modalController = inject(ModalController);
  protected readonly i18n = inject(I18nService).translateAll(WORKFLOW_I18N_KEYS) as WorkflowI18n;

  // inputs
  public readonly approval = input.required<ApprovalModel>();
  public readonly readOnly = input(true);
  public readonly canWithdraw = input(false);
  protected readonly isReadOnly = computed(() => coerceBoolean(this.readOnly()));

  // state
  protected readonly note = signal('');

  // derived — legacy documents may miss a field, so coalesce
  protected readonly subjectName = computed(() => this.approval()?.subjectName ?? this.approval()?.subjectKey ?? '');
  protected readonly kind = computed(() => this.approval()?.kind ?? '');
  protected readonly state = computed(() => this.approval()?.state ?? 'pending');
  protected readonly stateColor = computed(() => approvalStateColor(this.state()));
  protected readonly decided = computed(() => this.state() !== 'pending');
  protected readonly decisionDate = computed(() => this.approval()?.decisionDate ?? '');
  protected readonly decisionNote = computed(() => this.approval()?.decisionNote ?? '');
  protected readonly requesterName = computed(() => avatarName(this.approval()?.requestedBy));
  protected readonly approverName = computed(() => avatarName(this.approval()?.approver));

  protected readonly noteI18n = computed(() => ({
    name: 'note',
    label: this.i18n.approval_note_label(),
    placeholder: this.i18n.approval_note_placeholder(),
    helper: this.i18n.approval_note_helper(),
    maxLength: MAX_DECISION_NOTE_LENGTH,
  } as NotesInputI18n));

  /******************************* actions *************************************** */
  protected async decide(decision: 'approve' | 'reject' | 'withdraw'): Promise<void> {
    await dismissOverlay(this.modalController, { decision, note: this.note().trim() }, 'confirm');
  }
}

function avatarName(avatar: { name1?: string; name2?: string } | undefined): string {
  return `${avatar?.name1 ?? ''} ${avatar?.name2 ?? ''}`.trim();
}

import { Component, computed, inject, input } from '@angular/core';
import { IonContent, ModalController } from '@ionic/angular/standalone';

import { I18nService } from '@okr/shared-i18n';
import { ApprovalModel } from '@okr/shared-models';
import { Header } from '@okr/shared-ui';
import { dismissOverlay } from '@okr/shared-util-angular';
import { coerceBoolean } from '@okr/shared-util-core';

import { WORKFLOW_I18N_KEYS, WorkflowI18n } from '@okr/system-workflow-util';

import { ApprovalDecisionCard } from './approval-decision.card';

/**
 * Decide one approval (spec 2026-08-15-approval-workflow-spec.md §3.5). A thin modal host:
 * the decision UI lives in `ApprovalDecisionCard`; this only dismisses with its result.
 * Not a `building-forms` edit modal — see the card.
 */
@Component({
  selector: 'okr-approval-decide-modal',
  standalone: true,
  imports: [Header, IonContent, ApprovalDecisionCard],
  template: `
    <okr-header [i18n]="{ title: i18n.approval_decide_label() }" [isModal]="true" />
    <ion-content class="ion-no-padding">
      <okr-approval-decision-card [approval]="approval()" [i18n]="i18n"
        [canDecide]="!isReadOnly()" [canWithdraw]="canWithdraw()"
        (decided)="onDecided($event)" />
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

  protected async onDecided(d: { decision: 'approve' | 'reject' | 'withdraw'; note: string }): Promise<void> {
    await dismissOverlay(this.modalController, d, 'confirm');
  }
}

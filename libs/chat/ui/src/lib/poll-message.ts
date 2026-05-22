import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { ActionSheetController, ActionSheetOptions, ModalController } from '@ionic/angular/standalone';
import { signalStore, withProps } from '@ngrx/signals';

import { MatrixMessage } from '@bk2/shared-models';
import { createActionSheetButton, createActionSheetOptions } from '@bk2/shared-util-angular';
import { ENV } from '@bk2/shared-config';
import { I18nService } from '@bk2/shared-i18n';
import { hashUserIdToColor } from '@bk2/chat-util';

import { PollDetailModal } from './poll-detail.modal';
import { PFX } from './scope';

const PollMessageStore = signalStore(
  withProps(() => ({ i18nService: inject(I18nService) })),
  withProps(store => ({
    i18n: store.i18nService.translateAll({
      as_viewVotes: PFX + 'poll.actionsheet.viewVotes',
      as_end:       PFX + 'poll.actionsheet.end',
      cancel:       '@cancel',
    }),
  })),
);

@Component({
  selector: 'bk-poll-message',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [],
  providers: [PollMessageStore],
  styles: [`
    .poll-question {
      font-weight: 600;
      margin-bottom: 2px;
      font-size: 0.95rem;
      cursor: pointer;
    }
    .poll-hint {
      font-size: 0.8rem;
      color: var(--ion-color-medium);
      margin-bottom: 8px;
    }
    .answer-row {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 6px 10px;
      border-radius: 6px;
      cursor: pointer;
    }
    .answer-row.ended {
      cursor: default;
      opacity: 0.8;
    }
    .vote-indicator {
      width: 14px;
      height: 14px;
      border: 1.5px solid var(--ion-color-medium);
      flex-shrink: 0;
    }
    .vote-indicator.radio { border-radius: 50%; }
    .vote-indicator.checkbox { border-radius: 3px; }
    .vote-indicator.voted {
      background: var(--ion-color-primary);
      border-color: var(--ion-color-primary);
    }
    .answer-text {
      flex: 1;
      font-size: 0.9rem;
    }
    .answer-text.voted {
      color: var(--ion-color-primary);
      font-weight: 600;
    }
    .answer-stats {
      font-size: 0.8rem;
      color: var(--ion-color-medium);
      white-space: nowrap;
    }
    .answer-stats.voted { color: var(--ion-color-primary); }
    .voter-strip {
      display: flex;
      align-items: center;
      margin-left: 34px;
      margin-top: -2px;
      margin-bottom: 4px;
      gap: 0;
    }
    .voter-avatar {
      width: 16px;
      height: 16px;
      border-radius: 50%;
      overflow: hidden;
      border: 1px solid var(--ion-background-color, #fff);
      margin-left: -3px;
      flex-shrink: 0;
    }
    .voter-avatar:first-child { margin-left: 0; }
    .voter-avatar img { width: 100%; height: 100%; object-fit: cover; }
    .voter-initial {
      width: 16px;
      height: 16px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 8px;
      font-weight: 600;
      color: #fff;
    }
    .voter-overflow {
      font-size: 0.65rem;
      color: var(--ion-color-medium);
      margin-left: 3px;
    }
    .poll-footer {
      font-size: 0.78rem;
      color: var(--ion-color-medium);
      padding: 6px 10px 0;
    }
  `],
  template: `
    <div class="poll-question" (click)="onHeaderClick(); $event.stopPropagation()">{{ question() }}</div>
    <div class="poll-hint">{{ hint() }}</div>

    @for (answer of message().pollAnswers ?? []; track answer.id) {
      <div
        class="answer-row"
        [class.ended]="message().pollEnded || isUndisclosed()"
        (click)="onAnswerClick(answer.id); $event.stopPropagation()"
      >
        <div
          class="vote-indicator"
          [class.radio]="!isMultiSelect()"
          [class.checkbox]="isMultiSelect()"
          [class.voted]="isVoted(answer.id)"
        ></div>
        <span class="answer-text" [class.voted]="isVoted(answer.id)">{{ answer.body }}</span>
        <span class="answer-stats" [class.voted]="isVoted(answer.id)">
          @if (isUndisclosed()) { — } @else { {{ voteCount(answer.id) }} · {{ votePercent(answer.id) }}% }
        </span>
      </div>

      @if(visibleVoters(answer.id).length > 0) {
        <div class="voter-strip">
          @for(voter of visibleVoters(answer.id); track voter.userId) {
            <div class="voter-avatar">
              @if(voter.avatarUrl) {
                <img [src]="voter.avatarUrl" [alt]="voter.displayName" />
              } @else {
                <div class="voter-initial" [style.background-color]="color(voter.userId)">
                  {{ voter.displayName.charAt(0).toUpperCase() }}
                </div>
              }
            </div>
          }
          @if(overflowCount(answer.id) > 0) {
            <span class="voter-overflow">+{{ overflowCount(answer.id) }}</span>
          }
        </div>
      }
    }

    <div class="poll-footer">
      @if (message().pollEnded) {
        {{ '@chat.survey.ended' }}
      } @else {
        {{ totalVotes() }} {{ '@chat.survey.totalVotes' }}
        @if (myVoteAnswerIds().length > 0) {
          · {{ '@chat.survey.voted' }}
        }
      }
    </div>
  `
})
export class PollMessage {
  private readonly actionSheetController = inject(ActionSheetController);
  private readonly modalController = inject(ModalController);
  private readonly env = inject(ENV);
  private readonly pollStore = inject(PollMessageStore);

  public message = input.required<MatrixMessage>();
  public currentUserId = input.required<string>();

  public voteClicked = output<{ pollEventId: string; answerIds: string[] }>();
  public endPollClicked = output<{ pollEventId: string }>();

  protected readonly question = computed(() => {
    const content = this.message().content;
    return content?.['org.matrix.msc3381.poll']?.question?.body
      ?? this.message().body.split('\n')[0]
      ?? this.message().body;
  });

  protected readonly isMultiSelect = computed(() => (this.message().maxSelections ?? 1) > 1);

  protected readonly hint = computed(() =>
    this.isMultiSelect() ? '@chat.survey.chooseMultiple' : '@chat.survey.chooseOne'
  );

  protected readonly myVoteAnswerIds = computed(() => this.message().myVoteAnswerIds ?? []);

  protected readonly totalVotes = computed(() => {
    const votes = this.message().pollVotes ?? {};
    return Object.values(votes).reduce((sum, n) => sum + n, 0);
  });

  protected readonly isUndisclosed = computed(() => {
    const kind: string | undefined =
      this.message().content?.['org.matrix.msc3381.poll']?.kind;
    return typeof kind === 'string' && kind.endsWith('.undisclosed');
  });

  protected isVoted(answerId: string): boolean {
    return this.myVoteAnswerIds().includes(answerId);
  }

  protected voteCount(answerId: string): number {
    return this.message().pollVotes?.[answerId] ?? 0;
  }

  protected votePercent(answerId: string): number {
    const total = this.totalVotes();
    if (total === 0) return 0;
    return Math.round((this.voteCount(answerId) / total) * 100);
  }

  protected visibleVoters(answerId: string) {
    return (this.message().pollVoters?.[answerId] ?? []).slice(0, 4);
  }

  protected overflowCount(answerId: string): number {
    return Math.max(0, (this.message().pollVoters?.[answerId]?.length ?? 0) - 4);
  }

  protected color(userId: string): string {
    return hashUserIdToColor(userId);
  }

  protected onAnswerClick(answerId: string): void {
    if (this.message().pollEnded) return;
    if (this.isUndisclosed()) return;
    if (!(this.message().pollAnswers?.length)) return;

    if (this.isMultiSelect()) {
      const current = this.myVoteAnswerIds();
      const next = current.includes(answerId)
        ? current.filter((id: string) => id !== answerId)
        : [...current, answerId];
      this.voteClicked.emit({ pollEventId: this.message().eventId, answerIds: next });
    } else {
      this.voteClicked.emit({ pollEventId: this.message().eventId, answerIds: [answerId] });
    }
  }

  protected async onHeaderClick(): Promise<void> {
    const url = this.env.services.imgixBaseUrl;
    const opts: ActionSheetOptions = createActionSheetOptions('@actionsheet.label.choose');
    opts.buttons.push(createActionSheetButton('poll.viewVotes', this.pollStore.i18n.as_viewVotes(), url, 'chart'));
    if (!this.message().pollEnded && this.message().sender === this.currentUserId()) {
      opts.buttons.push(createActionSheetButton('poll.end', this.pollStore.i18n.as_end(), url, 'cancel-circle'));
    }
    opts.buttons.push(createActionSheetButton('cancel', this.pollStore.i18n.cancel(), url, 'cancel'));

    const sheet = await this.actionSheetController.create(opts);
    await sheet.present();
    const { data } = await sheet.onDidDismiss();
    if (!data) return;

    switch (data.action) {
      case 'poll.viewVotes':
        await this.openPollDetail();
        break;
      case 'poll.end':
        this.endPollClicked.emit({ pollEventId: this.message().eventId });
        break;
    }
  }

  private async openPollDetail(): Promise<void> {
    const modal = await this.modalController.create({
      component: PollDetailModal,
      componentProps: {
        pollAnswers: this.message().pollAnswers ?? [],
        pollVotes: this.message().pollVotes ?? {},
        pollVoters: this.message().pollVoters ?? {},
      }
    });
    await modal.present();
  }
}

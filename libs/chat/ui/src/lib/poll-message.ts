import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';

import { MatrixMessage } from '@okr/shared-models';
import { hashUserIdToColor, MatrixChatI18n } from '@okr/chat-util';

@Component({
  selector: 'okr-poll-message',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [],
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
    <!-- No own click handler: a tap on the poll (except the answer rows, which vote) bubbles up to the
         message bubble and opens the single, unified message action sheet (results / edit / end / delete …). -->
    <div class="poll-question">{{ question() }}</div>
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
        {{ i18n().survey_ended() }}
      } @else {
        {{ totalVotes() }} {{ i18n().survey_total() }}
        @if (myVoteAnswerIds().length > 0) {
          · {{ i18n().survey_voted() }}
        }
      }
    </div>
  `
})
export class PollMessage {
  // inputs
  public message = input.required<MatrixMessage>();
  public currentUserId = input.required<string>();
  public readonly i18n = input.required<MatrixChatI18n>();

  // outputs
  public voteClicked = output<{ pollEventId: string; answerIds: string[] }>();

  // computed
  protected readonly question = computed(() => {
    const content = this.message().content;
    return content?.['org.matrix.msc3381.poll']?.question?.body
      ?? this.message().body.split('\n')[0]
      ?? this.message().body;
  });

  protected readonly isMultiSelect = computed(() => (this.message().maxSelections ?? 1) > 1);

  protected readonly hint = computed(() =>
    this.isMultiSelect() ? this.i18n().choose_multiple() : this.i18n().choose_one()
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

  // methods
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

}

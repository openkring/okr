import { AsyncPipe } from '@angular/common';
import { Component, computed, input, output } from '@angular/core';
import { IonButton } from '@ionic/angular/standalone';

import { TranslatePipe } from '@bk2/shared-i18n';
import { MatrixMessage } from '@bk2/shared-models';

@Component({
  selector: 'bk-poll-message',
  standalone: true,
  imports: [AsyncPipe, TranslatePipe, IonButton],
  styles: [`
    .poll-question {
      font-weight: 600;
      margin-bottom: 8px;
      font-size: 0.95rem;
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
    .radio-dot {
      width: 14px;
      height: 14px;
      border-radius: 50%;
      border: 1.5px solid var(--ion-color-medium);
      flex-shrink: 0;
    }
    .radio-dot.voted {
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
    .answer-stats.voted {
      color: var(--ion-color-primary);
    }
    .poll-footer {
      font-size: 0.78rem;
      color: var(--ion-color-medium);
      padding: 6px 10px 0;
    }
    .end-button {
      margin-top: 8px;
      --padding-start: 10px;
      --padding-end: 10px;
    }
  `],
  template: `
    <div class="poll-question">{{ message().body }}</div>

    @for (answer of message().pollAnswers ?? []; track answer.id) {
      <div
        class="answer-row"
        [class.ended]="message().pollEnded || isUndisclosed()"
        (click)="onAnswerClick(answer.id)"
      >
        <div class="radio-dot" [class.voted]="answer.id === message().myVoteAnswerId"></div>
        <span class="answer-text" [class.voted]="answer.id === message().myVoteAnswerId">
          {{ answer.body }}
        </span>
        <span class="answer-stats" [class.voted]="answer.id === message().myVoteAnswerId">
          @if (isUndisclosed()) {
            —
          } @else {
            {{ voteCount(answer.id) }} · {{ votePercent(answer.id) }}%
          }
        </span>
      </div>
    }

    <div class="poll-footer">
      @if (message().pollEnded) {
        {{ '@chat.survey.ended' | translate | async }}
      } @else {
        {{ totalVotes() }} {{ '@chat.survey.totalVotes' | translate | async }}
        @if (message().myVoteAnswerId) {
          · {{ '@chat.survey.voted' | translate | async }}
        }
      }
    </div>

    @if (!message().pollEnded && message().sender === currentUserId()) {
      <ion-button
        fill="clear"
        size="small"
        color="medium"
        class="end-button"
        (click)="onEndPoll(); $event.stopPropagation()"
      >
        {{ '@chat.survey.end' | translate | async }}
      </ion-button>
    }
  `
})
export class PollMessageComponent {
  public message = input.required<MatrixMessage>();
  public currentUserId = input.required<string>();

  public voteClicked = output<{ pollEventId: string; answerId: string }>();
  public endPollClicked = output<{ pollEventId: string }>();

  protected readonly totalVotes = computed(() => {
    const votes = this.message().pollVotes ?? {};
    return Object.values(votes).reduce((sum, n) => sum + n, 0);
  });

  protected readonly isUndisclosed = computed(() => {
    const kind: string | undefined =
      this.message().content?.['org.matrix.msc3381.poll']?.kind;
    return typeof kind === 'string' && kind.endsWith('.undisclosed');
  });

  protected voteCount(answerId: string): number {
    return this.message().pollVotes?.[answerId] ?? 0;
  }

  protected votePercent(answerId: string): number {
    const total = this.totalVotes();
    if (total === 0) return 0;
    return Math.round((this.voteCount(answerId) / total) * 100);
  }

  protected onAnswerClick(answerId: string): void {
    if (this.message().pollEnded) return;
    if (this.isUndisclosed()) return;
    if (!(this.message().pollAnswers?.length)) return;
    this.voteClicked.emit({ pollEventId: this.message().eventId, answerId });
  }

  protected onEndPoll(): void {
    this.endPollClicked.emit({ pollEventId: this.message().eventId });
  }
}

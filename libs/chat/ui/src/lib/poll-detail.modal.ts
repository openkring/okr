import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { IonAvatar, IonContent, IonItem, IonLabel, IonList } from '@ionic/angular/standalone';

import { MatrixReadReceipt } from '@bk2/shared-models';
import { Header } from '@bk2/shared-ui';
import { hashUserIdToColor } from '@bk2/chat-util';

@Component({
  selector: 'bk-poll-detail-modal',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    Header,
    IonContent, IonList, IonItem, IonLabel, IonAvatar,
  ],
  styles: [`
    .answer-header {
      font-weight: 600;
      font-size: 0.9rem;
      padding: 12px 16px 4px;
      color: var(--ion-color-medium-shade);
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }
    .voter-avatar {
      width: 32px;
      height: 32px;
      border-radius: 50%;
      overflow: hidden;
      margin-inline-end: 12px;
    }
    .voter-avatar img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }
    .voter-initial {
      width: 32px;
      height: 32px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 13px;
      font-weight: 600;
      color: #fff;
    }
    .no-votes {
      font-size: 0.85rem;
      color: var(--ion-color-medium);
      padding: 4px 16px 8px;
    }
  `],
  template: `
    <bk-header title="@chat.survey.viewVotes.title" [isModal]="true" />
    <ion-content>
      @for(answer of pollAnswers(); track answer.id) {
        <div class="answer-header">{{ answer.body }} ({{ voteCount(answer.id) }})</div>
        @if(voters(answer.id).length === 0) {
          <p class="no-votes">{{ '@chat.survey.viewVotes.noVotes' }}</p>
        } @else {
          <ion-list lines="none">
            @for(voter of voters(answer.id); track voter.userId) {
              <ion-item>
                <ion-avatar slot="start" class="voter-avatar">
                  @if(voter.avatarUrl) {
                    <img [src]="voter.avatarUrl" [alt]="voter.displayName" />
                  } @else {
                    <div class="voter-initial" [style.background-color]="color(voter.userId)">
                      {{ voter.displayName.charAt(0).toUpperCase() }}
                    </div>
                  }
                </ion-avatar>
                <ion-label>{{ voter.displayName }}</ion-label>
              </ion-item>
            }
          </ion-list>
        }
      }
    </ion-content>
  `
})
export class PollDetailModal {
  public pollAnswers = input.required<Array<{ id: string; body: string }>>();
  public pollVotes = input<Record<string, number>>({});
  public pollVoters = input<Record<string, MatrixReadReceipt[]>>({});

  protected voters(answerId: string): MatrixReadReceipt[] {
    return this.pollVoters()[answerId] ?? [];
  }

  protected voteCount(answerId: string): number {
    return this.pollVotes()[answerId] ?? 0;
  }

  protected color(userId: string): string {
    return hashUserIdToColor(userId);
  }
}

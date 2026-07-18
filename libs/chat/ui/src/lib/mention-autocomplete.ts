import { Component, computed, input, output } from '@angular/core';
import { IonIcon } from '@ionic/angular/standalone';

import { SvgIconPipe } from '@okr/shared-pipes';
import { PersonModel } from '@okr/shared-models';
import { MatrixChatI18n } from '@okr/chat-util';

/** The canonical text inserted for a room-wide mention. */
export const MENTION_ROOM = '@room';

/** Aliases that also surface the @room entry, without ever being inserted verbatim. */
const ROOM_ALIASES = ['room', 'all', 'team', 'alle'];

/** Maximum number of person suggestions shown at once. */
const MAX_SUGGESTIONS = 8;

export type MentionPick =
  | { kind: 'room' }
  | { kind: 'person'; person: PersonModel };

@Component({
  selector: 'okr-mention-autocomplete',
  standalone: true,
  imports: [IonIcon, SvgIconPipe],
  styles: [`
    :host {
      position: absolute;
      bottom: 100%;
      left: 8px;
      right: 8px;
      z-index: 20;
      max-height: 240px;
      overflow-y: auto;
      background: var(--ion-background-color);
      border: 1px solid var(--ion-border-color, #dedede);
      border-radius: 8px;
      box-shadow: 0 -2px 12px rgba(0, 0, 0, 0.15);
    }
    .option {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 12px;
      cursor: pointer;
      font-size: 0.9375rem;
    }
    .option.active { background: var(--ion-color-light); }
    .option:hover { background: var(--ion-color-light); }
    .room-option { font-weight: 600; color: var(--ion-color-primary); }
  `],
  template: `
    @for (option of options(); track $index) {
      @if (option.kind === 'room') {
        <div class="option room-option" [class.active]="$index === activeIndex()" (click)="picked.emit(option)">
          <ion-icon src="{{ 'people' | svgIcon }}" />
          <span>{{ i18n().mention_everyone() }}</span>
        </div>
      } @else {
        <div class="option" [class.active]="$index === activeIndex()" (click)="picked.emit(option)">
          <ion-icon src="{{ 'person' | svgIcon }}" />
          <span>{{ option.person.firstName }} {{ option.person.lastName }}</span>
        </div>
      }
    }
  `,
})
export class MentionAutocomplete {
  // inputs
  public query = input.required<string>();
  public candidates = input.required<PersonModel[]>();
  public showRoomOption = input.required<boolean>();
  public activeIndex = input.required<number>();
  public i18n = input.required<MatrixChatI18n>();

  // outputs
  public picked = output<MentionPick>();

  /** The rendered options: the @room entry first (when offered and matching), then persons. */
  public options = computed((): MentionPick[] => {
    const query = this.query().toLowerCase();
    const result: MentionPick[] = [];
    if (this.showRoomOption() && ROOM_ALIASES.some((alias) => alias.startsWith(query))) {
      result.push({ kind: 'room' });
    }
    const persons = this.candidates()
      .filter((p) => `${p.firstName} ${p.lastName}`.toLowerCase().includes(query))
      .slice(0, MAX_SUGGESTIONS);
    for (const person of persons) result.push({ kind: 'person', person });
    return result;
  });
}

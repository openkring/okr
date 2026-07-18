import { Component, computed, input, output } from '@angular/core';
import { IonIcon } from '@ionic/angular/standalone';

import { SvgIconPipe } from '@okr/shared-pipes';
import { PersonModel } from '@okr/shared-models';
import { MatrixChatI18n } from '@okr/chat-util';

/** The canonical text inserted for a room-wide mention. */
export const MENTION_ROOM = '@room';

/**
 * DOM id of the overlay listbox — referenced by the composer's `aria-controls`.
 *
 * Per-instance: `matrix-chat` renders TWO composers (main + thread panel), so a global
 * constant would duplicate the id across both textareas and make the IDREF ambiguous.
 * `instanceId` comes from the composer that owns the overlay, so parent and child always
 * derive the same string.
 */
export function mentionListboxId(instanceId: number): string {
  return `okr-mention-listbox-${instanceId}`;
}

/** Deterministic DOM id of the option at `index` — referenced by `aria-activedescendant`. */
export function mentionOptionId(instanceId: number, index: number): string {
  return `okr-mention-option-${instanceId}-${index}`;
}

/** Aliases that also surface the @room entry, without ever being inserted verbatim. */
const ROOM_ALIASES = ['room', 'all', 'team', 'alle'];

/** Maximum number of person suggestions shown at once. */
const MAX_SUGGESTIONS = 8;

/**
 * Minimum query length before an alias match can surface @room.
 * Below this length, short prefixes like "al" collide with person names
 * (e.g. "Alice") because 'all'/'alle' also start with "al" — requiring
 * 3+ chars lets persons win for short queries while still matching aliases.
 */
const MIN_ALIAS_QUERY_LENGTH = 3;

export type MentionPick =
  | { kind: 'room' }
  | { kind: 'person'; person: PersonModel };

@Component({
  selector: 'okr-mention-autocomplete',
  standalone: true,
  imports: [IonIcon, SvgIconPipe],
  host: {
    'role': 'listbox',
    '[id]': 'listboxId()',
  },
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
        <div class="option room-option" role="option" [id]="optionId($index)"
             [attr.aria-selected]="$index === effectiveIndex()"
             [class.active]="$index === effectiveIndex()" (click)="picked.emit(option)">
          <ion-icon src="{{ 'people' | svgIcon }}" />
          <span>{{ i18n().mention_everyone() }}</span>
        </div>
      } @else {
        <div class="option" role="option" [id]="optionId($index)"
             [attr.aria-selected]="$index === effectiveIndex()"
             [class.active]="$index === effectiveIndex()" (click)="picked.emit(option)">
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
  /** Owning composer's instance number — makes the listbox/option ids unique per composer. */
  public instanceId = input.required<number>();

  /** Host id, so the composer can point `aria-controls` at this listbox. */
  protected listboxId = computed(() => mentionListboxId(this.instanceId()));

  /** Deterministic per-row id, matched by the composer's `aria-activedescendant`. */
  protected optionId = (index: number): string => mentionOptionId(this.instanceId(), index);

  // outputs
  public picked = output<MentionPick>();

  /** The rendered options: the @room entry first (when offered and matching), then persons. */
  public options = computed((): MentionPick[] => {
    const query = this.query().toLowerCase();
    const result: MentionPick[] = [];
    if (
      this.showRoomOption() &&
      (query.length === 0 ||
        (query.length >= MIN_ALIAS_QUERY_LENGTH && ROOM_ALIASES.some((alias) => alias.startsWith(query))))
    ) {
      result.push({ kind: 'room' });
    }
    const persons = this.candidates()
      .filter((p) => `${p.firstName} ${p.lastName}`.toLowerCase().includes(query))
      .slice(0, MAX_SUGGESTIONS);
    for (const person of persons) result.push({ kind: 'person', person });
    return result;
  });

  /**
   * The highlighted index, clamped to the rendered list.
   *
   * `options()` depends on `candidates()`/`showRoomOption()` as well as `query`, so the list can
   * shrink under an open overlay (async-resolving candidates) WITHOUT a query change resetting
   * the parent's `activeIndex`. The child is the only place that sees both values in the same
   * change-detection pass, and a child-local computed carries no NG0100 risk (that danger applies
   * only to a PARENT binding reading child state). Empty list → 0, never -1.
   */
  public effectiveIndex = computed(() => {
    const count = this.options().length;
    return count === 0 ? 0 : Math.min(this.activeIndex(), count - 1);
  });
}

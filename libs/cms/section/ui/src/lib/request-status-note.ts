import { Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { IonNote } from '@ionic/angular/standalone';

/**
 * The status of a request under its button (spec 1.88 §5.4). The text is rendered server-side;
 * only `{link}` is filled here, with the word «Chat» linking into the member's room — or the
 * same word as plain text while the room does not exist yet.
 */
@Component({
  selector: 'okr-request-status-note',
  standalone: true,
  imports: [RouterLink, IonNote],
  styles: [`ion-note { display: block; padding: 8px 16px; font-size: 1rem; }`],
  template: `
    <ion-note>
      {{ before() }}@if (hasLink()) {@if (roomId(); as room) {<a routerLink="/private/chat/contextMenuChat" [queryParams]="{ selectedRoom: room }">{{ linkLabel() }}</a>} @else {{{ linkLabel() }}}}{{ after() }}
    </ion-note>
  `,
})
export class RequestStatusNote {
  public readonly text = input.required<string>();
  public readonly roomId = input<string | undefined>();
  public readonly linkLabel = input('Chat');

  private readonly parts = computed(() => this.text().split('{link}'));
  protected readonly hasLink = computed(() => this.parts().length > 1);
  protected readonly before = computed(() => this.parts()[0] ?? '');
  protected readonly after = computed(() => this.parts().slice(1).join(''));
}

// libs/content/pdf-template/ui/src/lib/email-layout-picker.ts
import { Component, input, output } from '@angular/core';
import { SafeHtml } from '@angular/platform-browser';
import { IonLabel } from '@ionic/angular';

import { Spinner } from '@okr/shared-ui';

/**
 * The «Vorlage» of the composer as a row of cards: each a miniature of the layout as the server renders
 * it (with a sample text), the chosen one outlined. A thumbnail still loading shows a spinner, one that
 * failed only its name. Clicking a card (or Enter/Space on it) chooses it.
 */
@Component({
  selector: 'okr-email-layout-picker',
  standalone: true,
  imports: [IonLabel, Spinner],
  styles: [`
    .label { display: block; font-size: 0.8rem; color: var(--ion-color-medium-shade); padding: 0 0 4px; }
    .cards { display: flex; gap: 10px; overflow-x: auto; padding: 2px 2px 6px; }
    .card { flex: none; width: 132px; cursor: pointer; border: 2px solid var(--ion-border-color, #d0d7de); border-radius: 8px;
      overflow: hidden; background: var(--ion-background-color, #ffffff); }
    .card:focus-visible { outline: 2px solid var(--ion-color-primary); outline-offset: 2px; }
    .card.selected { border-color: var(--ion-color-primary); }
    /* the render is 600px wide (a mail's usual width), scaled down to the card */
    .thumb { position: relative; width: 128px; height: 150px; overflow: hidden; background: #ffffff; }
    .thumb iframe { width: 600px; height: 703px; border: 0; transform: scale(0.2134); transform-origin: 0 0; pointer-events: none; }
    .thumb okr-spinner { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; }
    .name { display: block; padding: 4px 6px; font-size: 0.8rem; text-align: center; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .card.selected .name { font-weight: 600; color: var(--ion-color-primary); }
  `],
  template: `
    <ion-label class="label">{{ label() }}</ion-label>
    <div class="cards" role="radiogroup" [attr.aria-label]="label()">
      @for (choice of choices(); track choice; let i = $index) {
        <div class="card" role="radio" tabindex="0" [class.selected]="choice === selected()" [attr.aria-checked]="choice === selected()"
          (click)="choose(choice)" (keydown.enter)="choose(choice)" (keydown.space)="$event.preventDefault(); choose(choice)">
          <div class="thumb">
            @let html = thumbnails()[choice];
            @if (html === undefined) {
              <okr-spinner />
            } @else if (html) {
              <iframe sandbox="" tabindex="-1" aria-hidden="true" [srcdoc]="html"></iframe>
            }
          </div>
          <span class="name">{{ labels()[i] }}</span>
        </div>
      }
    </div>
  `,
})
export class EmailLayoutPicker {
  public readonly label = input('');
  public readonly choices = input.required<string[]>();
  /** the display name per choice, same order */
  public readonly labels = input.required<string[]>();
  public readonly selected = input.required<string>();
  /** choice → rendered html; undefined = still loading, '' = could not be rendered */
  public readonly thumbnails = input<Record<string, SafeHtml | ''>>({});
  public readonly readOnly = input(false);

  public readonly selectedChange = output<string>();

  protected choose(choice: string): void {
    if (this.readOnly() || choice === this.selected()) return;
    this.selectedChange.emit(choice);
  }
}

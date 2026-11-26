// libs/content/pdf-template/ui/src/lib/mail-start.modal.ts
import { Component, computed, inject, input, signal } from '@angular/core';
import { IonContent, IonIcon, IonItem, IonLabel, IonList, IonListHeader, IonNote, IonSearchbar, ModalController } from '@ionic/angular';

import { SvgIconPipe } from '@okr/shared-pipes';
import { Header } from '@okr/shared-ui';
import { dismissOverlay } from '@okr/shared-util-angular';
import { filterStartChoices, type EmailComposerI18n, type StartChoice, type StartPick } from '@okr/content-pdf-template-util';

/**
 * The start step of a Versand (spec 1.176 §8.5), a picker: «Neu», the sender's own drafts, or «Frühere E-Mail kopieren» with a search.
 * One tap answers (dismissed with the `StartPick`); closing it is «Neu». It changes nothing itself: the composer continues or copies.
 * Subjects and first words are shown as text, never as html.
 */
@Component({
  selector: 'okr-mail-start-modal',
  standalone: true,
  imports: [Header, SvgIconPipe, IonContent, IonList, IonListHeader, IonItem, IonLabel, IonIcon, IonNote, IonSearchbar],
  styles: [`
    ion-list-header { font-weight: 600; }
    ion-searchbar { padding: 4px 8px 0; }
    .empty { display: block; padding: 8px 16px 16px; }
    .words { color: var(--ion-color-medium); }
  `],
  template: `
    <okr-header [i18n]="{ title: i18n().start_title() }" [isModal]="true" />
    <ion-content>
      <ion-list lines="inset">
        <ion-item button [detail]="false" (click)="pick({ kind: 'new' })">
          <ion-icon slot="start" src="{{ 'add-circle' | svgIcon }}" aria-hidden="true" />
          <ion-label>
            <h3>{{ i18n().start_new() }}</h3>
            <p>{{ i18n().start_new_helper() }}</p>
          </ion-label>
        </ion-item>
      </ion-list>

      @if (drafts().length > 0) {
        <ion-list lines="inset">
          <ion-list-header>{{ i18n().start_drafts() }}</ion-list-header>
          @for (choice of drafts(); track choice.pageKey) {
            <ion-item button [detail]="false" (click)="pick(choice)">
              <ion-icon slot="start" src="{{ 'edit' | svgIcon }}" aria-hidden="true" />
              <ion-label>
                <h3>{{ title(choice) }}</h3>
                <p>{{ date(choice.time) }}@if (choice.subject && choice.firstWords) { · <span class="words">{{ choice.firstWords }}</span> }</p>
              </ion-label>
            </ion-item>
          }
        </ion-list>
      }

      @if (earlier().length > 0) {
        <ion-list lines="inset">
          <ion-list-header>{{ i18n().start_earlier() }}</ion-list-header>
          <ion-searchbar [value]="search()" (ionInput)="search.set($any($event).detail.value ?? '')" [placeholder]="i18n().start_search()"
            [debounce]="150" inputmode="search" />
          @for (choice of shown(); track choice.pageKey) {
            <ion-item button [detail]="false" (click)="pick(choice)">
              <ion-icon slot="start" src="{{ 'copy' | svgIcon }}" aria-hidden="true" />
              <ion-label>
                <h3>{{ title(choice) }}</h3>
                <p>{{ date(choice.time) }}@if (choice.subject && choice.firstWords) { · <span class="words">{{ choice.firstWords }}</span> }</p>
              </ion-label>
            </ion-item>
          } @empty {
            <ion-note class="empty">{{ i18n().start_none_found() }}</ion-note>
          }
        </ion-list>
      }
    </ion-content>
  `,
})
export class MailStartModal {
  private readonly modalController = inject(ModalController);

  public readonly drafts = input<StartChoice[]>([]);
  /** At most `START_EARLIER_MAX`, newest first (`earlierMails`). */
  public readonly earlier = input<StartChoice[]>([]);
  public readonly i18n = input.required<EmailComposerI18n>();

  protected readonly search = signal('');
  protected readonly shown = computed(() => filterStartChoices(this.earlier(), this.search()));

  /** The subject; without one the first words, else «Ohne Betreff». The date stands below. */
  protected title(choice: StartChoice): string {
    return choice.subject || choice.firstWords || this.i18n().start_no_subject();
  }

  /** «25.11.2026», as the Versand overview shows dates; empty when unknown. */
  protected date(time: number): string {
    return time > 0 ? new Date(time).toLocaleDateString('de-CH') : '';
  }

  protected async pick(choice: StartPick): Promise<void> {
    await dismissOverlay(this.modalController, choice, 'confirm');
  }
}

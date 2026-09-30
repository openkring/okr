import { Component, OnDestroy, signal } from '@angular/core';
import { IonContent } from '@ionic/angular/standalone';

import { Header } from '@okr/shared-ui';

import type { ChessWorkerReply } from './chess.worker.protocol';

/** TEMPORARY (Task 2): shows that the worker answers. Replaced by the real page in Task 12. */
@Component({
  selector: 'okr-chess-page',
  standalone: true,
  imports: [Header, IonContent],
  template: `
    <okr-header [i18n]="{ title: 'Schach' }" />
    <ion-content class="ion-padding"><p>{{ status() }}</p></ion-content>
  `,
})
export class ChessPage implements OnDestroy {
  protected readonly status = signal('worker: waiting');
  private readonly worker = new Worker(new URL('./chess.worker', import.meta.url), { type: 'module' });

  public constructor() {
    this.worker.onmessage = (e: MessageEvent<ChessWorkerReply>) => this.status.set('worker: ok ' + JSON.stringify(e.data));
    this.worker.onerror = e => this.status.set('worker: error ' + e.message);
    this.worker.postMessage({ id: 1, fen: '', history: [], level: 'easy', budgetMs: 0 });
  }

  public ngOnDestroy(): void {
    this.worker.terminate();
  }
}

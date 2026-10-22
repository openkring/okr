import { Component, computed, inject, input, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { IonBackButton, IonButtons, IonContent, IonHeader, IonTitle, IonToolbar } from '@ionic/angular';
import { from, of } from 'rxjs';

import { EmptyList, Spinner } from '@okr/shared-ui';
import { fileTransferFailureOf } from '@okr/content-file-transfer-data-access';
import { FileTransferCard, FileTransferOpenEvent } from '@okr/content-file-transfer-ui';
import { openFileTransferFile } from '@okr/content-file-transfer-util';

import { FileTransferStore } from './file-transfer.store';

/**
 * One transfer inside the app — `/private/file-transfer/:transferKey` (spec 1.115 §4.2): the link of
 * the group-room card and of a member's notification, and «Öffnen» in «Meine Transfers». Reads
 * through the `getFileTransfer` / `openFileTransferFile` callables, which admit the sender, a
 * recipient person and an admin; everybody else gets «not found» (no 403, nothing leaks).
 */
@Component({
  selector: 'okr-file-transfer-view-page',
  standalone: true,
  imports: [
    FileTransferCard, Spinner, EmptyList,
    IonHeader, IonToolbar, IonButtons, IonBackButton, IonTitle, IonContent,
  ],
  styles: [`
    .player { padding: 0 16px 16px 16px; }
    video { width: 100%; max-height: 70vh; background: black; border-radius: 8px; }
  `],
  template: `
    <ion-header>
      <ion-toolbar color="secondary">
        <ion-buttons slot="start"><ion-back-button defaultHref="/private/file-transfer" /></ion-buttons>
        <ion-title>{{ store.i18n.card_title() }}</ion-title>
      </ion-toolbar>
    </ion-header>
    <ion-content>
      @if (viewResource.isLoading()) {
        <okr-spinner />
      } @else if (failure() === 'expired') {
        <okr-file-transfer-card [transferKey]="transferKey()" [expired]="true" />
      } @else if (failure()) {
        <okr-empty-list [message]="failure() === 'notFound' ? store.i18n.view_notFound() : store.i18n.failure_generic()" />
      } @else {
        <okr-file-transfer-card [transferKey]="transferKey()" [view]="view()" (open)="onOpen($event)" />
        @if (video(); as video) {
          <div class="player">
            <video [src]="video.url" controls autoplay playsinline [attr.aria-label]="video.name"></video>
          </div>
        }
      }
    </ion-content>
  `,
})
export class FileTransferViewPage {
  protected readonly store = inject(FileTransferStore);

  // route param (withComponentInputBinding); '' when unbound
  public readonly transferKey = input('');

  protected readonly viewResource = rxResource({
    params: () => ({ key: this.transferKey() ?? '' }),
    stream: ({ params }) => params.key ? from(this.store.fileTransferService.get(params.key)) : of(undefined),
  });

  // value() throws while the resource is in error state — read it only when there is one
  protected readonly view = computed(() => this.viewResource.hasValue() ? this.viewResource.value() : undefined);
  /** 'expired' | 'notFound' | 'other' | '' — from the callable's HttpsError message */
  protected readonly failure = computed(() => {
    const error = this.viewResource.error();
    if (!error) return this.transferKey() ? '' : 'notFound';
    return fileTransferFailureOf(error);
  });
  protected readonly video = signal<{ url: string; name: string } | undefined>(undefined);

  protected async onOpen(event: FileTransferOpenEvent): Promise<void> {
    const view = this.view();
    if (!view) return;
    try {
      const outcome = await openFileTransferFile(view, event, (index, disposition) => this.store.fileUrl(view.transferKey, index, disposition));
      if (outcome.kind === 'video') this.video.set({ url: outcome.url, name: outcome.name });
    } catch (error) {
      if (fileTransferFailureOf(error) === 'expired') this.viewResource.reload();
      await this.store.toast(this.store.errorText(error));
    }
  }
}

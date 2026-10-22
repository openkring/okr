import { Component, computed, inject, input, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { IonCard, IonCardContent, IonContent, IonHeader, IonNote, IonTitle, IonToolbar } from '@ionic/angular';
import { from, of } from 'rxjs';

import { I18nService } from '@okr/shared-i18n';
import { EmptyList, PasswordInput, PasswordInputI18n, Spinner } from '@okr/shared-ui';
import { FileTransferError, FileTransferService } from '@okr/content-file-transfer-data-access';
import { FileTransferCard, FileTransferOpenEvent } from '@okr/content-file-transfer-ui';
import { FILE_TRANSFER_I18N_KEYS, FileTransferI18n, openFileTransferFile } from '@okr/content-file-transfer-util';


type PublicFailure = 'notFound' | 'expired' | 'rateLimited' | 'unavailable' | 'other';

function toFailure(error: unknown): PublicFailure {
  const cause = (error as { cause?: unknown } | undefined)?.cause ?? error;
  if (!(cause instanceof FileTransferError)) return 'other';
  switch (cause.code) {
    case 'notFound': case 'expired': case 'rateLimited': case 'unavailable': return cause.code;
    default: return 'other';
  }
}

/**
 * The personal link of a transfer — `/public/file-transfer/:token` (spec 1.115 §4.2). Works without
 * login and without App Check: it talks only to the public link API (`publicView`,
 * `publicFileUrl`), where the token in the path is the credential. No store (nothing here needs
 * the signed-in user), so the page does not wait for or depend on any member data.
 *
 * States: loading, the transfer (password prompt first if it has one), «abgelaufen» (410), unknown
 * link (404), too many attempts (429), service down (503) or a generic failure.
 */
@Component({
  selector: 'okr-file-transfer-public-page',
  standalone: true,
  imports: [
    FileTransferCard, Spinner, EmptyList, PasswordInput,
    IonHeader, IonToolbar, IonTitle, IonContent, IonCard, IonCardContent, IonNote,
  ],
  styles: [`
    .player { padding: 0 16px 16px 16px; }
    video { width: 100%; max-height: 70vh; background: black; border-radius: 8px; }
    .error { display: block; padding-top: 8px; color: var(--ion-color-danger); }
    @media (width <= 600px) { ion-card { margin: 5px; } }
  `],
  template: `
    <ion-header>
      <ion-toolbar color="secondary">
        <ion-title>{{ i18n.card_title() }}</ion-title>
      </ion-toolbar>
    </ion-header>
    <ion-content>
      @if (viewResource.isLoading()) {
        <okr-spinner />
      } @else if (failure(); as failure) {
        @if (failure === 'expired') {
          <okr-file-transfer-card [expired]="true" />
        } @else {
          <okr-empty-list [message]="failureText(failure)" />
        }
      } @else if (view(); as view) {
        @if (view.needsPassword) {
          <ion-card>
            <ion-card-content>
              <ion-note>{{ i18n.public_passwordText() }}</ion-note>
              <okr-password-input [(value)]="password" [i18n]="passwordI18n()" [copyable]="false" />
              @if (passwordError()) {
                <ion-note class="error">{{ passwordError() }}</ion-note>
              }
            </ion-card-content>
          </ion-card>
        }
        <okr-file-transfer-card [transferKey]="view.transferKey" [view]="view" (open)="onOpen($event)" />
        @if (video(); as video) {
          <div class="player">
            <video [src]="video.url" controls autoplay playsinline [attr.aria-label]="video.name"></video>
          </div>
        }
        @if (openError()) {
          <okr-empty-list [message]="openError()" />
        }
      }
    </ion-content>
  `,
})
export class FileTransferPublicPage {
  private readonly fileTransferService = inject(FileTransferService);
  protected readonly i18n = inject(I18nService).translateAll(FILE_TRANSFER_I18N_KEYS) as FileTransferI18n;

  // route param (withComponentInputBinding); '' when unbound
  public readonly token = input('');

  protected readonly password = signal('');
  protected readonly passwordError = signal('');
  protected readonly openError = signal('');
  protected readonly video = signal<{ url: string; name: string } | undefined>(undefined);
  /** set when opening a file reports the link as gone after the page had loaded */
  private readonly lateFailure = signal<PublicFailure | undefined>(undefined);

  protected readonly viewResource = rxResource({
    params: () => ({ token: this.token() ?? '' }),
    stream: ({ params }) => params.token ? from(this.fileTransferService.publicView(params.token)) : of(undefined),
  });

  // value() throws while the resource is in error state — read it only when there is one
  protected readonly view = computed(() => this.viewResource.hasValue() ? this.viewResource.value() : undefined);
  protected readonly failure = computed<PublicFailure | undefined>(() => {
    if (this.lateFailure()) return this.lateFailure();
    const error = this.viewResource.error();
    if (error) return toFailure(error);
    return this.token() ? undefined : 'notFound';
  });

  protected readonly passwordI18n = computed<PasswordInputI18n>(() => ({
    name: 'password',
    label: this.i18n.password_label(),
    placeholder: this.i18n.public_passwordPlaceholder(),
  }));

  protected failureText(failure: PublicFailure): string {
    switch (failure) {
      case 'notFound': return this.i18n.public_notFound();
      case 'rateLimited': return this.i18n.public_rateLimited();
      case 'unavailable': return this.i18n.public_unavailable();
      case 'expired': return this.i18n.card_expired();
      default: return this.i18n.failure_generic();
    }
  }

  protected async onOpen(event: FileTransferOpenEvent): Promise<void> {
    const view = this.view();
    if (!view) return;
    this.passwordError.set('');
    this.openError.set('');
    const password = this.password().trim();
    if (view.needsPassword && !password) {
      this.passwordError.set(this.i18n.public_wrongPassword());
      return;
    }
    try {
      const outcome = await openFileTransferFile(view, event, (index, disposition) =>
        this.fileTransferService.publicFileUrl(this.token(), index, disposition, view.needsPassword ? password : undefined));
      if (outcome.kind === 'video') this.video.set({ url: outcome.url, name: outcome.name });
    } catch (error) {
      const code = error instanceof FileTransferError ? error.code : '';
      if (code === 'wrongPassword') {
        this.passwordError.set(this.i18n.public_wrongPassword());
      } else if (code === 'notFound' || code === 'expired') {
        this.lateFailure.set(code);
      } else {
        const failure = toFailure(error);
        this.openError.set(failure === 'rateLimited' || failure === 'unavailable' ? this.failureText(failure) : this.i18n.failure_generic());
      }
    }
  }
}

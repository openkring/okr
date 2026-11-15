import { Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import {
  IonButton, IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonContent, IonIcon, IonItem, IonLabel, IonList, IonNote,
  IonSegment, IonSegmentButton,
} from '@ionic/angular';

import { I18nService } from '@okr/shared-i18n';
import { SvgIconPipe } from '@okr/shared-pipes';
import { Header } from '@okr/shared-ui';
import { AlertService, copyToClipboardDeferred } from '@okr/shared-util-angular';
import { convertDateFormatToString, DateFormat } from '@okr/shared-util-core';
import { ContactsDavOp, ContactsDavStatus, fill, RebuildInterval, VCARD_I18N_KEYS, VcardI18n } from '@okr/vcard-util';

import { ContactsDavService } from './contacts-dav.service';

/**
 * «Adressbuch auf Mac und iPhone» (spec 1.159 §7.4). A status view, not an edit form: every
 * action applies on tap through the `contactsDavAdmin` callable (listed on the check-forms
 * MODAL_ALLOWLIST). The password is shown only in the answer to «Passwort erstellen» — the
 * server keeps only its hash.
 */
@Component({
  selector: 'okr-contacts-dav-modal',
  imports: [
    Header, IonContent, IonCard, IonCardHeader, IonCardTitle, IonCardContent, IonList, IonItem, IonLabel, IonNote,
    IonButton, IonIcon, IonSegment, IonSegmentButton, SvgIconPipe,
  ],
  styles: [`
    ion-label p, ion-note { white-space: normal; }
    .value { font-family: var(--ion-font-family-monospace, monospace); word-break: break-all; }
    .actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 8px; }
  `],
  template: `
    <okr-header [i18n]="{ title: i18n.dav_title() }" [isModal]="true" />
    <ion-content class="ion-padding">
      <p>{{ i18n.dav_intro() }}</p>

      <ion-card>
        <ion-card-content>
          <ion-list lines="full">
            <ion-item>
              <ion-label>
                <p>{{ i18n.dav_server() }}</p>
                <h3 class="value">{{ status().serverUrl }}</h3>
              </ion-label>
              <ion-button slot="end" fill="clear" (click)="copy(status().serverUrl)" [attr.aria-label]="i18n.dav_copy()">
                <ion-icon slot="icon-only" src="{{ 'copy' | svgIcon }}" />
              </ion-button>
            </ion-item>
            <ion-item>
              <ion-label>
                <p>{{ i18n.dav_username() }}</p>
                <h3 class="value">{{ status().username }}</h3>
              </ion-label>
              <ion-button slot="end" fill="clear" (click)="copy(status().username)" [attr.aria-label]="i18n.dav_copy()">
                <ion-icon slot="icon-only" src="{{ 'copy' | svgIcon }}" />
              </ion-button>
            </ion-item>
            <ion-item>
              <ion-label>
                <p>{{ i18n.dav_password() }}</p>
                @if (token(); as t) {
                  <h3 class="value">{{ t }}</h3>
                } @else {
                  <h3>{{ status().hasToken ? '••••••••' : i18n.dav_noPassword() }}</h3>
                }
              </ion-label>
              @if (token(); as t) {
                <ion-button slot="end" fill="clear" (click)="copy(t)" [attr.aria-label]="i18n.dav_copy()">
                  <ion-icon slot="icon-only" src="{{ 'copy' | svgIcon }}" />
                </ion-button>
              }
            </ion-item>
          </ion-list>
          @if (token()) {
            <ion-note color="warning" class="ion-display-block ion-margin-top">{{ i18n.dav_shownOnce() }}</ion-note>
          }
          @if (status().hasToken) {
            <ion-note class="ion-display-block ion-margin-top">{{ lastUsedText() }}</ion-note>
          }
          <div class="actions">
            <ion-button size="small" [disabled]="busy()" (click)="mint()">{{ status().hasToken ? i18n.dav_regenerate() : i18n.dav_create() }}</ion-button>
            @if (status().hasToken) {
              <ion-button size="small" fill="outline" color="danger" [disabled]="busy()" (click)="revoke()">{{ i18n.dav_revoke() }}</ion-button>
            }
          </div>
        </ion-card-content>
      </ion-card>

      <ion-card>
        <ion-card-header><ion-card-title>{{ i18n.dav_steps_title() }}</ion-card-title></ion-card-header>
        <ion-card-content>
          <p>{{ i18n.dav_steps_mac() }}</p>
          <p class="ion-margin-top">{{ i18n.dav_steps_iphone() }}</p>
        </ion-card-content>
      </ion-card>

      <ion-card>
        <ion-card-header><ion-card-title>{{ i18n.dav_book_title() }}</ion-card-title></ion-card-header>
        <ion-card-content>
          <p>{{ bookText() }}</p>
          <div class="actions">
            <ion-button size="small" fill="outline" [disabled]="busy()" (click)="refresh()">{{ i18n.dav_refresh() }}</ion-button>
          </div>
          <p class="ion-margin-top">{{ i18n.dav_interval_label() }}</p>
          <ion-segment [value]="status().rebuildInterval" [disabled]="busy()" (ionChange)="setInterval($event.detail.value)">
            <ion-segment-button value="weekly"><ion-label>{{ i18n.dav_interval_weekly() }}</ion-label></ion-segment-button>
            <ion-segment-button value="daily"><ion-label>{{ i18n.dav_interval_daily() }}</ion-label></ion-segment-button>
            <ion-segment-button value="manual"><ion-label>{{ i18n.dav_interval_manual() }}</ion-label></ion-segment-button>
          </ion-segment>
        </ion-card-content>
      </ion-card>
    </ion-content>
  `,
})
export class ContactsDavModal {
  private readonly service = inject(ContactsDavService);
  private readonly alertService = inject(AlertService);
  protected readonly i18n = inject(I18nService).translateAll(VCARD_I18N_KEYS) as VcardI18n;

  public readonly tenantId = input.required<string>();
  public readonly initial = input.required<ContactsDavStatus>();

  protected readonly status = signal<ContactsDavStatus>({ serverUrl: '', username: '', hasToken: false, rebuildInterval: 'weekly' });
  /** the plain password — only right after «Passwort erstellen» */
  protected readonly token = signal<string | undefined>(undefined);
  protected readonly busy = signal(false);

  public constructor() {
    // seed once from the input; later answers of the callable replace it
    let seeded = false;
    effect(() => {
      const initial = this.initial();
      if (seeded) return;
      seeded = true;
      untracked(() => this.status.set(initial));
    });
  }

  protected readonly lastUsedText = computed(() => {
    const at = this.status().lastUsedAt;
    return at ? fill(this.i18n.dav_lastUsed(), { date: this.viewDate(at) }) : this.i18n.dav_neverUsed();
  });

  protected readonly bookText = computed(() => {
    const s = this.status();
    if (!s.builtAt) return this.i18n.dav_book_empty();
    const d = new Date(s.builtAt);
    const date = `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`;
    return fill(this.i18n.dav_book_state(), { count: s.cardCount ?? 0, date });
  });

  private viewDate(storeDate: string): string {
    return convertDateFormatToString(storeDate, DateFormat.StoreDate, DateFormat.ViewDate, false);
  }

  protected copy(text: string): void {
    // no await before the clipboard call: Safari drops the user activation at the first await
    void copyToClipboardDeferred(Promise.resolve(text)).then(() => this.alertService.showToast(this.i18n.dav_copied()));
  }

  protected async mint(): Promise<void> {
    if (this.status().hasToken && !(await this.alertService.confirm(this.i18n.dav_regenerateConfirm(), true))) return;
    const s = await this.run('mint');
    if (s?.token) this.token.set(s.token);
  }

  protected async revoke(): Promise<void> {
    if (!(await this.alertService.confirm(this.i18n.dav_revokeConfirm(), true))) return;
    if (await this.run('revoke')) this.token.set(undefined);
  }

  protected async refresh(): Promise<void> {
    if (await this.run('refresh')) await this.alertService.showToast(this.i18n.dav_refreshDone());
  }

  protected async setInterval(value: unknown): Promise<void> {
    if (value !== 'weekly' && value !== 'daily' && value !== 'manual') return;
    if (value === this.status().rebuildInterval) return;
    await this.run('setInterval', value as RebuildInterval);
  }

  private async run(op: ContactsDavOp, interval?: RebuildInterval): Promise<ContactsDavStatus | undefined> {
    this.busy.set(true);
    try {
      const s = await this.service.call({ tenantId: this.tenantId(), op, interval });
      this.status.set({ ...s, token: undefined }); // the plain password lives only in `token()`
      return s;
    } catch (e) {
      const code = (e as { code?: string }).code ?? '';
      this.alertService.error(code.endsWith('resource-exhausted') ? this.i18n.dav_refreshTooSoon() : this.i18n.dav_error());
      return undefined;
    } finally {
      this.busy.set(false);
    }
  }
}
